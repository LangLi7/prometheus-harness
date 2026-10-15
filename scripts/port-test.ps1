# =============================================================================
# Prueft die Startup-Methodik in allen drei Faellen.
# =============================================================================
#
# **Warum drei Faelle und nicht einer.** Eine Portwahl, die nur "geht" und
# "geht nicht" kennt, ist nicht geprueft:
#
#   1. Standardport frei                    -> er wird genommen, ohne Umweg
#   2. Standardport belegt                  -> der naechste freie wird genommen
#                                              UND genannt
#   3. Standardport belegt + --strict-port  -> sichtbarer Abbruch
#
# **Der eigene Fehler, der hier behoben ist.** Die erste Fassung belegte den Port
# mit `bun -e "Bun.serve({...})"` und umgeleiteter Ausgabe. Der Halter band den
# Port **nicht** - und der Test meldete in FASS 2 UND 3 "Port ist frei". Er
# pruefte also nichts und sah trotzdem gruen aus. Jetzt ist der Halter eine
# eigene Datei, die ihren Erfolg **ausgibt** ("halter: lauscht auf ..."), und
# dieser Test wartet auf genau diese Zeile. Ohne sie bricht er ab.
#
# =============================================================================

$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path (Split-Path -Parent $PSCommandPath) '..')).Path
Push-Location $repo
$env:PATH = (Join-Path $env:USERPROFILE '.bun\bin') + ';' + $env:PATH
$BUN = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
$TESTPORT = 5780
$fehler = 0

# -----------------------------------------------------------------------------
# Aufraeumen NACH PID - nicht nach Prozessname und Alter
# -----------------------------------------------------------------------------
#
# **Der Fehler, der hier stand - gefunden von der Aufsicht (Befund B13).**
# Die erste Fassung raeumte so auf:
#
#     Get-Process bun | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-2) }
#                     | Stop-Process -Force
#
# Das toetet **jeden** bun-Prozess, der juenger als zwei Minuten ist - auch den
# `bun test` oder `bun install` eines anderen. Still: der fremde Lauf stirbt
# ohne Meldung, und ein abgebrochenes `bun install` kann `node_modules`
# beschaedigen. Das Muster stand an **sechs** Stellen im Projekt.
#
# Jetzt wird nur getoetet, was **dieses Skript selbst** gestartet hat: die PID
# aus `-PassThru`, und mit `/T` auch deren Kinder. Was nicht in der Liste steht,
# wird nicht angefasst.
# -----------------------------------------------------------------------------

# Die PIDs, die dieses Skript gestartet hat.
$script:gestartet = New-Object System.Collections.Generic.List[int]

<#
** Sammelt eine PID und ALLE Nachfahren.
**
** Warum die Nachfahren ausdruecklich gesucht werden.** `bun run scripts/start.mjs`
** startet einen **zweiten** `bun`-Prozess - den Host. `taskkill /T` nimmt diesen
** Enkel nachweislich **nicht** mit: gemessen am 13.10.2026 hinterliess jeder Lauf
** dieses Skripts ein Paar aus Launcher und Host als Waise; **sechs** Paare
** standen noch, als es auffiel.
**
** Warum EINE Abfrage und nicht eine je Knoten.** Die erste Fassung fragte fuer
** jeden Knoten `Get-CimInstance` mit Filter ab. Gemessen: das Skript brauchte
** dadurch **ueber fuenf Minuten** und lief in die Zeitgrenze - WMI-Abfragen sind
** teuer, und der Baum ist klein. Jetzt wird die Prozesstabelle **einmal** geholt
** und der Baum im Speicher gebaut.
#>
function SammleBaum([int]$wurzel) {
  $alle = New-Object System.Collections.Generic.List[int]
  $alle.Add($wurzel)
  # Eine Abfrage fuer alle Prozesse, dann im Speicher arbeiten.
  $tabelle = @{}
  foreach ($p in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
    $eltern = [int]$p.ParentProcessId
    if (-not $tabelle.ContainsKey($eltern)) {
      $tabelle[$eltern] = New-Object System.Collections.Generic.List[int]
    }
    $tabelle[$eltern].Add([int]$p.ProcessId)
  }
  $offen = New-Object System.Collections.Generic.Queue[int]
  $offen.Enqueue($wurzel)
  while ($offen.Count -gt 0) {
    $jetzt = $offen.Dequeue()
    if (-not $tabelle.ContainsKey($jetzt)) { continue }
    foreach ($k in $tabelle[$jetzt]) {
      if (-not $alle.Contains($k)) {
        $alle.Add($k)
        $offen.Enqueue($k)
      }
    }
  }
  return $alle
}

<#
** Beendet einen Prozessbaum - erst die Kinder, dann die Wurzel.
**
** Nur diese PIDs. Nie nach Prozessname und Alter (Befund B13 der Aufsicht).
#>
function BeendeBaum([int]$wurzelPid) {
  if ($wurzelPid -le 0) { return }
  $baum = @(SammleBaum $wurzelPid)
  # Umgekehrte Reihenfolge: die Blaetter zuerst. Wird die Wurzel zuerst beendet,
  # verliert man die Verbindung zu den Kindern und sie bleiben als Waisen.
  [array]::Reverse($baum)
  foreach ($p in $baum) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
  # `taskkill` zusaetzlich, ohne `/T`: es erreicht auch Prozesse, die
  # `Stop-Process` nicht auflisten kann. Es ist **nicht** die einzige Massnahme.
  foreach ($p in $baum) { & taskkill /PID $p /F 2>&1 | Out-Null }
}

<#
** Beendet alles, was dieses Skript gestartet hat - und nur das.
#>
function BeendeEigene {
  foreach ($p in ($script:gestartet | Sort-Object -Descending)) { BeendeBaum $p }
  $script:gestartet.Clear()
  Start-Sleep -Milliseconds 500
}

<#
** Prueft, ob ein Port noch belegt ist. Beweist, dass das Aufraeumen wirkte.
#>
function PortIstFrei([int]$port) {
  $t = New-Object System.Net.Sockets.TcpClient
  try {
    $t.Connect('127.0.0.1', $port)
    $t.Close()
    return $false
  } catch {
    return $true
  } finally {
    $t.Dispose()
  }
}

<#
** Wartet, bis ein Port frei ist - oder meldet, dass er es nicht wurde.
**
** Warum gewartet wird: der Kernel gibt einen Port nicht im selben Augenblick
** frei, in dem der Prozess endet.
#>
function WarteAufFreienPort([int]$port, [int]$sekunden = 5) {
  for ($i = 0; $i -lt ($sekunden * 2); $i++) {
    if (PortIstFrei $port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function StarteHost([string[]]$extra) {
  $log = Join-Path $env:TEMP "pmh-porttest-$([guid]::NewGuid().ToString('N').Substring(0,6)).log"
  $a = @('run', 'scripts/start.mjs', '--no-go', '--port', "$TESTPORT") + $extra
  $proc = Start-Process -FilePath $BUN -ArgumentList $a -WorkingDirectory $repo `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -NoNewWindow
  $script:gestartet.Add($proc.Id)
  Start-Sleep -Seconds 6
  $lines = @()
  foreach ($f in @($log, "$log.err")) { if (Test-Path $f) { $lines += (Get-Content $f -ErrorAction SilentlyContinue) } }
  $beendet = $proc.HasExited

  # ---------------------------------------------------------------------------
  # Den Port pruefen, den der Host WIRKLICH genommen hat - nicht den gefragten.
  # ---------------------------------------------------------------------------
  # **Der Fehler, der hier stand.** Geprueft wurde `$TESTPORT`. Nimmt der Host
  # wegen Belegung den naechsten Port (5781), band er 5780 **nie** - und die
  # Pruefung meldete "Port 5780 ist nach dem Aufraeumen noch belegt", obwohl das
  # Aufraeumen gewirkt hatte. Ein **falscher Befund** ist so schaedlich wie ein
  # uebersehener: er lehrt, die Pruefung zu ignorieren.
  $gewaehlt = $null
  foreach ($z in $lines) {
    $m = [regex]::Match($z, 'Oberfl(ae|ae)che: http://127\.0\.0\.1:(\d+)/')
    if ($m.Success) { $gewaehlt = [int]$m.Groups[2].Value; break }
  }

  BeendeBaum $proc.Id

  # Der Prozessbaum ist weg. Jetzt muss der Port frei werden.
  if ($gewaehlt -ne $null) {
    if (-not (WarteAufFreienPort $gewaehlt 8)) {
      Write-Host "  FEHLER: Port $gewaehlt ist nach dem Aufraeumen noch belegt"
      $fehler++
    }
  } elseif (-not $beendet -and -not $proc.HasExited) {
    Write-Host "  FEHLER: der Launcher laeuft nach dem Aufraeumen noch"
    $fehler++
  }

  # **Und keine Waisen.** Der Enkel (`apps/cli`) ist der, den `taskkill /T` nicht
  # mitnimmt. Ein Test, der bei jedem Lauf Prozesse hinterlaesst, ist selbst ein
  # Fehler - hier wird es nachgezaehlt.
  $waisen = @(Get-CimInstance Win32_Process -Filter "Name = 'bun.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*apps\cli\src\main.ts*' -or $_.CommandLine -like '*apps/cli/src/main.ts*' })
  if ($waisen.Count -gt 0) {
    Write-Host "  FEHLER: $($waisen.Count) Host-Prozess(e) ueberlebten das Aufraeumen"
    foreach ($w in $waisen) { Write-Host ("    PID {0} Eltern {1}" -f $w.ProcessId, $w.ParentProcessId) }
    $fehler++
  }

  return @{ Lines = ($lines | Where-Object { $_ -match '^\[pmh\]' }); All = $lines; Exited = $beendet; Port = $gewaehlt }
}

# -----------------------------------------------------------------------------
# **Der stumme Verbraucher.** `StarteHost` gibt zwei Listen zurueck: `Lines` (nur
# Zeilen mit dem Praefix `[pmh]`) und `All` (alles). Die Faelle 1-3 zeigten `Lines`
# an und prueften gegen `Lines` -- `All` wurde zurueckgegeben und **nie benutzt**.
#
# Faellt der Host aus einem Grund OHNE dieses Praefix aus -- ein Bun-Fehler, eine
# Stapelspur, ein fehlendes Modul --, dann ist `Lines` **leer**. Der Test meldete
# dann "FEHLER: Fall 1 nicht erkannt" und zeigte **nichts**. Eine Fehlermeldung
# ohne Spur ist keine Diagnose.
#
# **Warum hier reines ASCII steht, gemessen am 14.10.2026.** Diese Datei hat kein
# BOM, und Windows PowerShell 5.1 liest sie deshalb als ANSI (cp1252). Ein
# UTF-8-Gedankenstrich U+2014 wird dabei zu den Bytes E2 80 94, und 0x94 ist in
# cp1252 das Zeichen U+201D -- ein **spitzes** Anfuehrungszeichen. PowerShell
# behandelt U+201C/U+201D als **String-Begrenzer**. Die Zeichenkette endet damit
# mitten im Satz, der Rest wird als Code gelesen: 13 Parserfehler, und pwsh 7
# meldete 0. Wer nur mit pwsh prueft, sieht den Defekt nicht.
#
# **Der Filter bleibt fuer die PRUEFUNGEN** -- sie suchen `[pmh]`-Meldungen.
# Gezeigt wird `All`.
function ZeigeProtokoll($r, [int]$n) {
  if (@($r.All).Count -eq 0) {
    Write-Host "  (das Protokoll ist LEER - der Host hat NICHTS geschrieben)"
    return
  }
  $r.All | Select-Object -First $n | ForEach-Object { "  " + $_ }
  if (@($r.All).Count -gt $n) { Write-Host "  ... ($(@($r.All).Count) Zeilen insgesamt)" }
  # **Und den Fall benennen, in dem die Pruefung blind ist.**
  if (@($r.Lines).Count -eq 0) {
    Write-Host "  HINWEIS: KEINE [pmh]-Zeile im Protokoll - der Grund stand oben OHNE Praefix."
    Write-Host "           Die Pruefungen dieses Tests greifen auf [pmh] und sehen hier nichts."
  }
}

function BelegePort([int]$port) {
  $log = Join-Path $env:TEMP "halter-$port.log"
  Remove-Item $log, "$log.err" -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $BUN -ArgumentList @('scripts/port-holder.mjs', "$port") -WorkingDirectory $repo `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -NoNewWindow
  $script:gestartet.Add($proc.Id)
  # **Auf den Nachweis warten, nicht auf die Zeit hoffen.** Ohne diese Zeile
  # haette der Test wieder nichts geprueft.
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    if ((Test-Path $log) -and ((Get-Content $log -Raw -ErrorAction SilentlyContinue) -match 'lauscht auf')) {
      return $proc
    }
    if ($proc.HasExited) {
      # **Die Begruendung vollstaendig ausgeben.** Hier stand nur die erste Zeile
      # von `.err` - und die war leer, weil `port-holder.mjs` seinen Fehler nach
      # **stdout** schreibt. Eine Meldung "Halter beendet sich - " ohne Grund
      # sagt niemandem etwas.
      Write-Host ("  FEHLER: Halter beendet sich (exit {0})" -f $proc.ExitCode)
      foreach ($f in @("$log.err", $log)) {
        if (Test-Path $f) {
          Get-Content $f -ErrorAction SilentlyContinue | Select-Object -First 3 | ForEach-Object { Write-Host "         $_" }
        }
      }
      return $null
    }
  }
  BeendeBaum $proc.Id
  return $null
}

Write-Host "=== FALL 1: Port $TESTPORT frei -> er wird genommen ==="
$r1 = StarteHost @()
ZeigeProtokoll $r1 7
if (-not ($r1.Lines -join ' ' -match "Port $TESTPORT \(Standard\) ist frei")) { Write-Host "  FEHLER: Fall 1 nicht erkannt"; $fehler++ }

Write-Host ""
Write-Host "=== FALL 2: Port $TESTPORT belegt -> Ausweichen mit Begruendung ==="
$h = BelegePort $TESTPORT
if ($h -eq $null) {
  Write-Host "  UEBERSPRUNGEN: Halter konnte den Port nicht belegen - dieser Test prueft nichts."
  $fehler++
} else {
  Write-Host "  (Halter laeuft, PID $($h.Id))"
  $r2 = StarteHost @()
  ZeigeProtokoll $r2 7
  $joined = $r2.Lines -join ' '
  if ($joined -match "Port $TESTPORT ist belegt") { Write-Host "  OK: Ausweichen genannt" } else { Write-Host "  FEHLER: kein Ausweichen genannt"; $fehler++ }
  # **Kodierungsunabhaengige Muster -- gemessen am 14.10.2026.**
  #
  # Hier stand `"gewaehlt: $n|gewaehlt: $n"` (urspruenglich einmal mit ue, einmal mit
  # Umlaut). Zwei Fallen auf einmal:
  #
  # 1. Die Transliteration auf ASCII hat beide Alternativen zu DERSELBEN gemacht --
  #    der zweite Zweig war damit wirkungslos.
  # 2. Das Muster mit Umlaut traf nur ZUFALLIG: 5.1 liest diese Datei als ANSI, der
  #    Umlaut im Quelltext wird also zu "A-tilde-a-umlaut" -- und die Ausgabe des
  #    Kindes wird ebenso falsch dekodiert. Zwei Fehler hoben einander auf.
  #
  # `.{1,2}` trifft beide Formen: "gewaehlt" (kein Sonderzeichen) und "gewXXhlt"
  # (zwei Ersatzzeichen). Wer die Konsole spaeter auf UTF-8 stellt, aendert nichts.
  if ($joined -match "gew.{1,2}hlt: $($TESTPORT + 1)") { Write-Host "  OK: naechster Port gewaehlt" }
  else {
    Write-Host "  HINWEIS: naechster Port nicht erkannt -- gesucht: 'gew.{1,2}hlt: $($TESTPORT + 1)'"
    Write-Host "           die ersten Zeichen des Protokolls: $($joined.Substring(0, [Math]::Min(160, $joined.Length)))"
  }
  if ($joined -match "Oberfl.{1,2}che: http://127\.0\.0\.1:$($TESTPORT + 1)/") { Write-Host "  OK: Oberflaechen-Adresse zeigt auf den gewaehlten Port" }
  else { Write-Host "  HINWEIS: Adresse pruefen -- gesucht: 'Oberfl.{1,2}che: http://127.0.0.1:$($TESTPORT + 1)/'" }

  # ---------------------------------------------------------------------------
  # Den Halter SOFORT beenden - nicht erst nach Fall 3.
  # ---------------------------------------------------------------------------
  # **Der Fehler, der hier stand.** Das Aufraeumen von `$h` geschah erst NACH
  # Fall 3. Port 5780 war also noch belegt, als Fall 3 seinen EIGENEN Halter
  # darauf binden wollte - der scheiterte mit `EADDRINUSE` und beendete sich.
  # Fall 3 meldete dann "UEBERSPRUNGEN", und die Ursache sah nach einem Fehler
  # des Halters aus statt nach einem Reihenfolgefehler im Test.
  BeendeBaum $h.Id
  if (-not (WarteAufFreienPort $TESTPORT 5)) {
    Write-Host "  FEHLER: Port $TESTPORT wurde nach dem Halter nicht frei"
    $fehler++
  }
  $h = $null
}

Write-Host ""
Write-Host "=== FALL 3: Port $TESTPORT belegt + --strict-port -> sichtbarer Abbruch ==="
$h2 = BelegePort $TESTPORT
if ($h2 -eq $null) {
  Write-Host "  UEBERSPRUNGEN: Halter konnte den Port nicht belegen."
  $fehler++
} else {
  $r3 = StarteHost @('--strict-port')
  ZeigeProtokoll $r3 8
  if (($r3.Lines -join ' ') -match 'FEHLER: Kein freier Port') { Write-Host "  OK: sichtbarer Abbruch mit Begruendung" } else { Write-Host "  FEHLER: kein Abbruch gemeldet"; $fehler++ }
  BeendeBaum $h2.Id
}

if ($h -ne $null) { BeendeBaum $h.Id }
BeendeEigene

Write-Host ""
Write-Host "=== FALL 4: die genannte Adresse ist BENUTZBAR (nicht nur vorhanden) ==="
# -----------------------------------------------------------------------------
# **Warum dieser Fall nachtraeglich dazukam.** Die Faelle 1-3 pruefen, dass die
# Adresse den *gewaehlten Port* nennt. Genau das tat sie - und der Aufruf
# antwortete trotzdem mit **401**, weil das Anmeldetoken fehlte. Ein Test, der
# die Adresse nur als Zeichenkette prueft, sieht das nicht. Hier wird die Adresse
# deshalb **aufgerufen**.
#
# Der Host wird dafuer in einem eigenen Lauf gestartet, weil die Adresse erst mit
# der Hostausgabe erscheint und der Zugriff auf den *laufenden* Host geschehen
# muss.
# -----------------------------------------------------------------------------
$env:PATH = (Join-Path $env:USERPROFILE '.bun\bin') + ';' + $env:PATH
$log4 = Join-Path $env:TEMP "pmh-tokenprobe.log"
Remove-Item $log4, "$log4.err" -ErrorAction SilentlyContinue
$p4 = Start-Process -FilePath $BUN -ArgumentList @('run', 'scripts/start.mjs', '--no-go', '--port', "$($TESTPORT + 10)") -WorkingDirectory $repo `
  -RedirectStandardOutput $log4 -RedirectStandardError "$log4.err" -PassThru -NoNewWindow
$gefunden = $null
for ($i = 0; $i -lt 24; $i++) {
  Start-Sleep -Milliseconds 500
  $text = ''
  foreach ($f in @($log4, "$log4.err")) { if (Test-Path $f) { $text += (Get-Content $f -Raw -ErrorAction SilentlyContinue) } }
  $m = [regex]::Match($text, 'http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_\-]+')
  if ($m.Success) { $gefunden = $m.Value; break }
}
if ($gefunden -eq $null) {
  Write-Host "  FEHLER: keine benutzbare Adresse in der Ausgabe - der Start nennt sie nicht"
  $fehler++
} else {
  $token = ($gefunden -split 'token=')[1]
  $ohne = ($gefunden -split '\?')[0]
  Write-Host "  Adresse gefunden: $gefunden"
  Write-Host "  Tokenlaenge: $($token.Length)"
  try {
    $mit = Invoke-WebRequest -Uri $gefunden -UseBasicParsing -TimeoutSec 6
    Write-Host "  OK: mit Token -> $($mit.StatusCode), $($mit.RawContentLength) Zeichen"
  } catch {
    Write-Host "  FEHLER: mit Token -> $($_.Exception.Response.StatusCode.value__)"; $fehler++
  }
  try {
    $null = Invoke-WebRequest -Uri $ohne -UseBasicParsing -TimeoutSec 6
    Write-Host "  FEHLER: ohne Token -> 200 - die Oberflaeche ist ungeschuetzt!"; $fehler++
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) { Write-Host "  OK: ohne Token -> 401 (geschuetzt)" }
    else { Write-Host "  FEHLER: ohne Token -> $code (erwartet 401)"; $fehler++ }
  }
}
if (-not $p4.HasExited) { BeendeBaum $p4.Id }
BeendeEigene

Write-Host ""
Write-Host ("=== Ergebnis: {0} Befund(e) ===" -f $fehler)
Pop-Location
# **Der Exit-Code ist das Ergebnis.** Wer dieses Skript aufruft, liest ihn - nicht
# die Ausgabe. Ohne diese Zeile endet es immer mit 0, auch bei Befunden.
if ($fehler -gt 0) { exit 1 } else { exit 0 }
