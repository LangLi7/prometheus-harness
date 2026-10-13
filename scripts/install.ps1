<#
.SYNOPSIS
    Prometheus Harness — Installation für Windows.

.DESCRIPTION
    **Was diese Datei ist und was nicht.** Sie ist eine **Hülle**: sie stellt
    sicher, daß Bun vorhanden ist, und übergibt dann an `scripts/install.mjs`.
    Die eigentliche Installation steht **dort** — einmal, für beide Plattformen.

    **Warum die Logik nicht hier steht.** Gemessen auf dem Zielrechner am
    13.10.2026: `sh` fehlt, `bash` gibt es nur aus WSL (und dessen `bash` sieht
    `C:\…` nicht), `unzip` fehlt. Ein Installer, dessen Logik in der Shell
    liegt, hätte dort **keinen Interpreter**. Bun dagegen ist die eine
    Voraussetzung, die dieses Projekt ohnehin hat.

    ## Die Ausführungsrichtlinie — der Stolperstein

    Auf dem Zielrechner steht `CurrentUser = Restricted`. Ein `.ps1`-Skript
    **lädt dann nicht**:

        & : Die Datei …\install.ps1 kann nicht geladen werden, weil das
        Ausführen von Skripten auf diesem System deaktiviert ist.

    Das ist die Voreinstellung vieler Windows-Rechner. Zwei Auswege, beide
    dokumentiert und beide **ohne** dauerhafte Änderung am System:

        # einmalig, nur für diesen Aufruf:
        powershell -ExecutionPolicy Bypass -File scripts\install.ps1

        # oder: den Inhalt als Befehl übergeben (lädt keine Datei):
        Get-Content scripts\install.ps1 -Raw | Invoke-Expression

    Dieses Skript ändert die Richtlinie **nicht** von selbst: das wäre eine
    Änderung an der Sicherheitseinstellung eines fremden Rechners.

.PARAMETER OhneStapel
    Datenbank und Redis nicht starten und keine Migrationen ausführen.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1

.EXAMPLE
    pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/install.ps1 -OhneStapel
#>
[CmdletBinding()]
param(
  [switch]$OhneStapel
)

$ErrorActionPreference = 'Stop'

# In das Projektverzeichnis wechseln — unabhängig davon, von wo aufgerufen wird.
$projekt = (Resolve-Path (Join-Path (Split-Path -Parent $PSCommandPath) '..')).Path
Push-Location $projekt
try {
  Write-Host 'Prometheus Harness — Installation'
  Write-Host "Projekt: $projekt"
  Write-Host ''

  # --- 1. Bun sicherstellen --------------------------------------------------
  # **Der übliche Ort, falls der PATH noch nicht stimmt.** Das
  # Installationsskript von Bun legt `bun.exe` nach `%USERPROFILE%\.bun\bin` und
  # trägt es in die Benutzerumgebung ein — eine **laufende** Shell sieht das
  # nicht.
  function Get-BunBefehl {
    # **Warum nicht einfach `bun`.** Gemessen auf dem Zielrechner: es liegen
    # DREI `bun`-Einträge im PATH, und zwei sind defekt —
    # `%APPDATA%\npm\bun.cmd` ruft ein fremdarchigtes `bun.exe` auf, und
    # `%APPDATA%\npm\bun.ps1` wird von der Ausführungsrichtlinie blockiert. Die
    # funktionierende Fassung liegt unter `%USERPROFILE%\.bun\bin\bun.exe`.
    $eigene = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
    if (Test-Path $eigene) { return $eigene }
    $imPath = Get-Command bun -ErrorAction SilentlyContinue
    if ($imPath) { return $imPath.Source }
    return $null
  }

  $bun = Get-BunBefehl
  if (-not $bun) {
    Write-Host 'Bun ist nicht installiert — wird jetzt installiert.'
    Write-Host '  irm bun.sh/install.ps1 | iex'
    Write-Host ''
    # Der offizielle Weg des Bun-Projekts für Windows.
    Invoke-RestMethod bun.sh/install.ps1 | Invoke-Expression
    $bun = Get-BunBefehl
    if (-not $bun) {
      Write-Host ''
      Write-Host 'FEHLER: Bun ist auch nach der Installation nicht auffindbar.'
      Write-Host 'Starte eine NEUE PowerShell und rufe dieses Skript erneut auf.'
      exit 1
    }
    Write-Host ''
    Write-Host "Bun wurde installiert: $(& $bun --version)"
  }

  Write-Host "Bun: $(& $bun --version)"

  # --- 2. Übergeben an das eigentliche Installationsskript -------------------
  $argumente = @('scripts/install.mjs')
  if ($OhneStapel) { $argumente += '--ohne-stapel' }

  # **Der Exit-Code wird durchgereicht.** Ohne diese Zeile endet PowerShell mit 0,
  # auch wenn die Installation gescheitert ist — und ein Aufrufer aus einem
  # anderen Skript merkte es nicht.
  & $bun @argumente
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
