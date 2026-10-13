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
# Port **nicht** — und der Test meldete in FASS 2 UND 3 "Port ist frei". Er
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

function StarteHost([string[]]$extra) {
  $log = Join-Path $env:TEMP "pmh-porttest-$([guid]::NewGuid().ToString('N').Substring(0,6)).log"
  $a = @('run', 'scripts/start.mjs', '--no-go', '--port', "$TESTPORT") + $extra
  $proc = Start-Process -FilePath $BUN -ArgumentList $a -WorkingDirectory $repo `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -NoNewWindow
  Start-Sleep -Seconds 6
  $lines = @()
  foreach ($f in @($log, "$log.err")) { if (Test-Path $f) { $lines += (Get-Content $f -ErrorAction SilentlyContinue) } }
  $beendet = $proc.HasExited
  if (-not $beendet) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Get-Process bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-1) } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  return @{ Lines = ($lines | Where-Object { $_ -match '^\[pmh\]' }); All = $lines; Exited = $beendet }
}

function BelegePort([int]$port) {
  $log = Join-Path $env:TEMP "halter-$port.log"
  Remove-Item $log, "$log.err" -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $BUN -ArgumentList @('scripts/port-halter.mjs', "$port") -WorkingDirectory $repo `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -NoNewWindow
  # **Auf den Nachweis warten, nicht auf die Zeit hoffen.** Ohne diese Zeile
  # haette der Test wieder nichts geprueft.
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    if ((Test-Path $log) -and ((Get-Content $log -Raw -ErrorAction SilentlyContinue) -match 'lauscht auf')) {
      return $proc
    }
    if ($proc.HasExited) {
      Write-Host "  FEHLER: Halter beendet sich — " -NoNewline
      Get-Content "$log.err" -ErrorAction SilentlyContinue | Select-Object -First 1
      return $null
    }
  }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  return $null
}

Write-Host "=== FALL 1: Port $TESTPORT frei -> er wird genommen ==="
$r1 = StarteHost @()
$r1.Lines | Select-Object -First 7 | ForEach-Object { "  " + $_ }
if (-not ($r1.Lines -join ' ' -match "Port $TESTPORT \(Standard\) ist frei")) { Write-Host "  FEHLER: Fall 1 nicht erkannt"; $fehler++ }

Write-Host ""
Write-Host "=== FALL 2: Port $TESTPORT belegt -> Ausweichen mit Begruendung ==="
$h = BelegePort $TESTPORT
if ($h -eq $null) {
  Write-Host "  UEBERSPRUNGEN: Halter konnte den Port nicht belegen — dieser Test prueft nichts."
  $fehler++
} else {
  Write-Host "  (Halter laeuft, PID $($h.Id))"
  $r2 = StarteHost @()
  $r2.Lines | Select-Object -First 7 | ForEach-Object { "  " + $_ }
  $joined = $r2.Lines -join ' '
  if ($joined -match "Port $TESTPORT ist belegt") { Write-Host "  OK: Ausweichen genannt" } else { Write-Host "  FEHLER: kein Ausweichen genannt"; $fehler++ }
  if ($joined -match "gewaehlt: $($TESTPORT + 1)|gewählt: $($TESTPORT + 1)") { Write-Host "  OK: naechster Port gewaehlt" } else { Write-Host "  HINWEIS: naechster Port nicht erkannt" }
  if ($joined -match "Oberfläche: http://127\.0\.0\.1:$($TESTPORT + 1)/") { Write-Host "  OK: Oberflaechen-Adresse zeigt auf den gewaehlten Port" } else { Write-Host "  HINWEIS: Adresse pruefen" }
}

Write-Host ""
Write-Host "=== FALL 3: Port $TESTPORT belegt + --strict-port -> sichtbarer Abbruch ==="
$h2 = BelegePort $TESTPORT
if ($h2 -eq $null) {
  Write-Host "  UEBERSPRUNGEN: Halter konnte den Port nicht belegen."
  $fehler++
} else {
  $r3 = StarteHost @('--strict-port')
  $r3.Lines | Select-Object -First 8 | ForEach-Object { "  " + $_ }
  if (($r3.Lines -join ' ') -match 'FEHLER: Kein freier Port') { Write-Host "  OK: sichtbarer Abbruch mit Begruendung" } else { Write-Host "  FEHLER: kein Abbruch gemeldet"; $fehler++ }
  Stop-Process -Id $h2.Id -Force -ErrorAction SilentlyContinue
}

if ($h -ne $null) { Stop-Process -Id $h.Id -Force -ErrorAction SilentlyContinue }
Get-Process bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-5) } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== FALL 4: die genannte Adresse ist BENUTZBAR (nicht nur vorhanden) ==="
# -----------------------------------------------------------------------------
# **Warum dieser Fall nachtraeglich dazukam.** Die Faelle 1-3 pruefen, dass die
# Adresse den *gewaehlten Port* nennt. Genau das tat sie — und der Aufruf
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
  Write-Host "  FEHLER: keine benutzbare Adresse in der Ausgabe — der Start nennt sie nicht"
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
    Write-Host "  FEHLER: ohne Token -> 200 — die Oberflaeche ist ungeschuetzt!"; $fehler++
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) { Write-Host "  OK: ohne Token -> 401 (geschuetzt)" }
    else { Write-Host "  FEHLER: ohne Token -> $code (erwartet 401)"; $fehler++ }
  }
}
if (-not $p4.HasExited) { Stop-Process -Id $p4.Id -Force -ErrorAction SilentlyContinue }
Get-Process bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-2) } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host ("=== Ergebnis: {0} Befund(e) ===" -f $fehler)
Pop-Location
