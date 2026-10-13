# =============================================================================
# Prueft den Stack von Null: Volumes weg, hochfahren, Rechte pruefen.
# =============================================================================
#
# **Warum "von Null" und nicht "nochmal hochfahren".** Die Einrichtung laeuft in
# PostgreSQL nur beim **ersten** Start eines leeren Datenverzeichnisses. Ein
# zweiter Start mit gefuelltem Volume ueberspringt sie komplett — ein Test, der
# nur neu startet, prueft die Einrichtung also **nicht**.
#
# Und genau das ist der Pfad, den ein Fremder geht: `git clone` →
# `docker compose up`. Wenn der scheitert, scheitert das ganze Projekt.
param(
  [switch]$KeepVolumes,
  [switch]$SkipReset
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSCommandPath | Resolve-Path | Select-Object -ExpandProperty Path
Push-Location $repo

Write-Host "=== 1. Alles weg (Container, Netz, Daten) ==="
if (-not $SkipReset) {
  docker compose down -v --remove-orphans 2>&1 | Select-Object -Last 3
} else {
  Write-Host "  (uebersprungen)"
}

Write-Host ""
Write-Host "=== 2. Hochfahren ==="
docker compose up -d 2>&1 | Select-Object -Last 6

Write-Host ""
Write-Host "=== 3. Auf Bereitschaft warten (der healthcheck entscheidet) ==="
$ready = $false
for ($i = 1; $i -le 60; $i++) {
  Start-Sleep -Seconds 2
  $ps = docker compose ps --format '{{.Name}}|{{.Status}}' 2>&1
  $pg = ($ps | Where-Object { $_ -like 'pmh-postgres*' })
  $rd = ($ps | Where-Object { $_ -like 'pmh-redis*' })
  if ($pg -match 'healthy' -and $rd -match 'healthy') { $ready = $true; Write-Host "  bereit nach $($i*2)s"; break }
  if ($ps | Where-Object { $_ -match 'Exit|Restarting' }) { Write-Host "  PROBLEM: $_"; break }
}
if (-not $ready) { Write-Host "  NICHT bereit — Protokoll:"; docker compose logs --tail 20 2>&1 | ForEach-Object { "    $_" } }

Write-Host ""
Write-Host "=== 4. Die Einrichtung: was hat sie gemeldet? ==="
$initLog = docker compose logs postgres 2>&1
$errors = $initLog | Select-String -Pattern 'ERROR|FATAL|FEHLER|syntax error'
if (($errors | Measure-Object).Count -gt 0) {
  Write-Host "  FEHLER in der Einrichtung:"
  $errors | Select-Object -First 8 | ForEach-Object { "    " + $_.Line }
} else {
  Write-Host "  keine Fehler"
}
$initLog | Select-String -Pattern '=== 0|=== Die vier|OK:|WARNUNG' | Select-Object -First 12 | ForEach-Object { "  " + $_.Line }

Write-Host ""
Write-Host "=== 5. Die Tabelle der Rollen (aus der Ausgabe von 02) ==="
$initLog | Select-String -Pattern 'rolle\s+\||^\s+pmh_|superuser\s+\|' | Select-Object -First 12 | ForEach-Object { "  " + $_.Line }

Write-Host ""
Write-Host "=== 6. Die Vorgaben fuer kuenftige Objekte (03 + 04) ==="
$initLog | Select-String -Pattern 'fuer_rolle|defaclrole|Vorgaben|04:' | Select-Object -First 12 | ForEach-Object { "  " + $_.Line }

Pop-Location
