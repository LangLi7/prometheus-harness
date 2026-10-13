<#
.SYNOPSIS
  Räumt verwaiste PMH-Hosts auf — nach Herkunft, nicht nach Name und Alter.

.DESCRIPTION
  **Warum diese Datei existiert.** Die Port-Tests des Projekts (`scripts/port-test.ps1`) starten je Fall
  einen Host und lassen danach Prozesse stehen. Gemessen am 13.10.2026 um **13:41:50**: **sechs** Hosts
  liefen weiter (Ports 5780–5783, 5790, 5791), Alter 5,9 bis 11,4 Minuten, zusammen **1.129,7 MB**
  Arbeitsspeicher — und **einer von ihnen hielt Port 5780**, den der nächste Testlauf braucht. Befund
  **B22** im Protokoll der Aufsicht. Der bauende Agent hat diese sechs um 13:42 **selbst entfernt**.

  **Die Ursache ist inzwischen gemessen — Befund B23.** Die neue Fassung von `port-test.ps1` räumt
  **gar nichts** auf: `function BeendeBaum([int]$pid)` bindet `$pid`, und das ist in PowerShell eine
  **schreibgeschützte automatische Variable**. Der Funktionsrumpf wird nie erreicht, der Fehler ist
  nicht terminierend — das Skript läuft weiter, als wäre nichts gewesen. **Acht** Aufrufe schlagen
  fehl. Wer diesen Fehler behebt (`[int]$prozessId`), braucht dieses Skript hier nur noch als Netz.

  **Korrektur einer früheren Vermutung (Regel H6).** Hier stand, der Mechanismus sei „`StarteHost`
  beendet den Launcher, und `Stop-Process -Force` liefert kein SIGINT/SIGTERM". Für die **neue**
  Fassung ist das widerlegt (B23). Für die **alte** ist er **offen**: ihre Fenster (1, 5 und 2 Minuten)
  hätten die 1,13 bis 11,4 Minuten alten Prozesse treffen müssen, und `Get-Process bun` **sieht** sie.
  Die Zeilen haben in jenen Läufen also **nicht gewirkt** — warum, ist von hier aus nicht entschieden.

  **Der Unterschied zu „Get-Process bun | Stop-Process".** Dieses Skript tötet **nicht** nach
  Prozessname und Alter (das ist die Ursache, dass die Waisen unbemerkt blieben — Befund **B13**),
  sondern prüft für **jeden** Kandidaten:
    1. der Prozess ist `bun`,
    2. seine Kommandozeile nennt **dieses Repository** (`$Repo`),
    3. und er ist ein **Host** (`apps/cli`) oder ein **Launcher** (`scripts/start.mjs`) dieses Projekts.
  Getötet wird über die **PID mit Baum** (`taskkill /T /F`) — damit stirbt auch, was der Prozess
  gestartet hat.

.PARAMETER Anwenden
  Ohne diesen Schalter wird **nur angezeigt**. Erst mit ihm wird beendet.

.PARAMETER MinAlterMinuten
  Nur Prozesse, die **mindestens** so viele Minuten alt sind. Vorgabe: 3.
  Diese Schwelle ist Absicht: läuft gerade ein Port-Test, dann sind dessen Hosts
  **jung** und gehören ihm — sie dürfen nicht weggeräumt werden, sonst zerstört
  man die Messung, die gerade läuft. Alt genug zu sein ist **notwendig, nicht
  hinreichend**: die Herkunft (Kommandozeile) entscheidet, das Alter siebt nur
  die lebenden Kinder eines laufenden Tests aus.

.PARAMETER Repo
  Wurzel des Projekts. Vorgabe: der Ordner zwei Ebenen über dieser Datei.

.EXAMPLE
  pwsh -File waisen-aufraeumen.ps1              # nur anzeigen
  pwsh -File waisen-aufraeumen.ps1 -Anwenden    # beenden
#>
[CmdletBinding()]
param(
  [switch]$Anwenden,
  [double]$MinAlterMinuten = 3,
  [string]$Repo = (Resolve-Path (Join-Path (Split-Path -Parent $PSCommandPath) '..\..\..\..')).Path
)

$ErrorActionPreference = 'Continue'
$repoKlein = $Repo.ToLowerInvariant()

Write-Host "=== Verwaiste PMH-Prozesse ==="
Write-Host "Repository: $Repo"
Write-Host "Modus     : $(if ($Anwenden) { 'ANWENDEN (beendet)' } else { 'anzeigen (beendet nichts)' })"
Write-Host ""

$jetzt = Get-Date
$kandidaten = @()
$zuJung = @()
foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='bun.exe'" -ErrorAction SilentlyContinue)) {
  $cmd = [string]$p.CommandLine
  if ($cmd -eq '') { continue }
  if (-not $cmd.ToLowerInvariant().Contains($repoKlein)) { continue }   # fremde bun-Prozesse bleiben unberührt
  $art = if ($cmd -match 'apps[\\/]cli') { 'Host' } elseif ($cmd -match 'scripts[\\/]start\.mjs') { 'Launcher' } else { $null }
  if ($null -eq $art) { continue }
  $prozess = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
  $alter = [math]::Round(($jetzt - $p.CreationDate).TotalMinutes, 1)
  if ($alter -lt $MinAlterMinuten) { $zuJung += "PID $($p.ProcessId) ($art, $alter min)"; continue }
  $kandidaten += [pscustomobject]@{
    PID     = $p.ProcessId
    Art     = $art
    Port    = [regex]::Match($cmd, '--port\s+(\d+)').Groups[1].Value
    Alter   = $alter
    MB      = if ($prozess) { [math]::Round($prozess.WorkingSet64 / 1MB, 1) } else { 0 }
  }
}

if ($zuJung.Count -gt 0) {
  Write-Host ("Übergangen — jünger als {0} min, gehören vermutlich einem laufenden Test:" -f $MinAlterMinuten)
  foreach ($z in $zuJung) { Write-Host "  $z" }
  Write-Host ""
}

if ($kandidaten.Count -eq 0) {
  Write-Host "Keine Kandidaten — es läuft kein Host und kein Launcher dieses Projekts, der alt genug wäre."
  exit 0
}

$kandidaten | Sort-Object Art, Alter -Descending | Format-Table -AutoSize
$summeMB = ($kandidaten | Measure-Object -Property MB -Sum).Sum
Write-Host ("Summe: {0:N1} MB in {1} Prozess(en)" -f $summeMB, $kandidaten.Count)

$halten = $kandidaten | Where-Object { $_.Art -eq 'Host' -and $_.Port -ne '' } | Select-Object -ExpandProperty Port
if ($halten) { Write-Host ("Belegte Ports: {0}" -f ($halten -join ', ')) }
Write-Host ""

if (-not $Anwenden) {
  Write-Host "Es wurde NICHTS beendet. Zum Beenden: -Anwenden"
  exit 0
}

# **Erst die Hosts, dann die Launcher** — umgekehrt startet der Launcher nichts nach (er startet nur einmal).
foreach ($k in ($kandidaten | Sort-Object { if ($_.Art -eq 'Host') { 0 } else { 1 } })) {
  Write-Host ("  beende PID {0} ({1}, Port {2}, {3} min) samt Baum …" -f $k.PID, $k.Art, $k.Port, $k.Alter)
  & taskkill /pid $k.PID /T /F 2>&1 | ForEach-Object { "    $_" }
}

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "=== Kontrolle ==="
$nachher = Get-CimInstance Win32_Process -Filter "Name='bun.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($repoKlein) -and ($_.CommandLine -match 'apps[\\/]cli|scripts[\\/]start\.mjs') }
Write-Host ("Verbleibende Hosts/Launcher dieses Projekts: {0}" -f (@($nachher) | Measure-Object).Count)
foreach ($p in @($nachher)) { Write-Host ("  PID {0}" -f $p.ProcessId) }
