# Prometheus Tray — Installation in einen normalen Benutzerordner
#
# Warum nicht direkt aus dem Projekt starten?
# Der DSH-Workspace traegt unter Windows das Label `Low Mandatory Level`.
# Prozesse, die von dort gestartet werden, laufen mit niedriger Integritaet.
# Die Taskleiste laeuft mit Medium-Integritaet; UIPI blockiert dann
# `Shell_NotifyIconW` mit Fehler 5. Deshalb liegen die Binaries und die
# Verknuepfungen hier ausserhalb des Workspace.
#
# Aufruf (keine Administratorrechte noetig):
#   powershell -ExecutionPolicy Bypass -File native\pmh-tray\install.ps1

[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'PrometheusTray')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent (Split-Path -Parent $scriptDir)
$sourceGui = Join-Path $repo 'target\release\pmh-tray-gui.exe'
$sourceCli = Join-Path $repo 'target\release\pmh-tray.exe'

if (-not (Test-Path (Join-Path $repo 'scripts\start.mjs'))) {
    throw "Projektwurzel nicht gefunden: $repo"
}
foreach ($source in @($sourceGui, $sourceCli)) {
    if (-not (Test-Path $source)) {
        throw "Release-Binary fehlt: $source`nBitte zuerst ausfuehren: cargo build --release -p pmh-tray"
    }
}

# A running exe cannot be replaced. Quitting the tray also stops a harness it
# started; that is exactly what its own menu says, so the script does not do it
# silently.
$running = Get-Process -Name pmh-tray-gui,pmh-tray -ErrorAction SilentlyContinue
if ($running) {
    throw "Das Tray laeuft noch (PID $($running.Id -join ', ')). Bitte im Tray-Menue 'Beenden (stoppt den Harness)' waehlen und die Installation erneut starten."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $sourceGui (Join-Path $InstallDir 'pmh-tray-gui.exe') -Force
Copy-Item $sourceCli (Join-Path $InstallDir 'pmh-tray.exe') -Force

$readme = @'
# Prometheus Tray

Dieser Ordner liegt **ausserhalb** des DSH-Workspace. Das ist Absicht: Der
Workspace traegt unter Windows das Label `Low Mandatory Level`; Prozesse, die
von dort gestartet werden, laufen mit niedriger Integritaet. Dann verweigert
Windows `Shell_NotifyIconW` mit Fehler 5 (Zugriff verweigert), und es erscheint
kein Symbol im Infobereich.

## Starten

Doppelklick auf **Prometheus Tray.lnk** (in diesem Ordner oder auf dem Desktop).

Wichtig: Die Verknuepfung setzt das Arbeitsverzeichnis auf
`C:\Users\Chang\prometheus-harness`. Nur so findet das Programm das Projekt.
Die .exe nicht direkt doppelklicken, sonst fehlt dieses Arbeitsverzeichnis.

Danach: Rechtsklick auf den farbigen Punkt -> **Starten**. Gruen = laeuft.
**Im Browser oeffnen** enthaelt den Token.

## Autostart

Im Tray-Menue **Autostart beim Anmelden** anhaken. Die Verknuepfung zeigt auf
`pmh-tray-gui.exe` in diesem Ordner und hat das Projekt als Arbeitsordner.

## Diagnose

```powershell
.\pmh-tray.exe --status
.\pmh-tray.exe --probe-tray
```

Protokoll: `C:\Users\Chang\prometheus-harness\.pmh-build\pmh-tray.log`
'@
Set-Content -Path (Join-Path $InstallDir 'README.md') -Value $readme -Encoding UTF8

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$gui = Join-Path $InstallDir 'pmh-tray-gui.exe'

function New-TrayShortcut([string]$path) {
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = $gui
    $link.WorkingDirectory = $repo
    $link.Description = 'Prometheus Harness im Infobereich starten'
    $link.IconLocation = "$gui,0"
    $link.Save()
}

$shortcuts = @(
    (Join-Path $InstallDir 'Prometheus Tray.lnk'),
    (Join-Path $repo 'Prometheus Tray.lnk')
)
if ($desktop) {
    $shortcuts += (Join-Path $desktop 'Prometheus Tray.lnk')
}
foreach ($shortcut in $shortcuts) {
    New-TrayShortcut $shortcut
}

Write-Host "Installiert: $InstallDir"
Write-Host "Verknuepfungen:"
foreach ($shortcut in $shortcuts) {
    Write-Host "  $shortcut"
}
Write-Host ''
Write-Host 'Wichtig: Immer die Verknuepfung starten, nicht die .exe direkt.'
Write-Host 'Das Arbeitsverzeichnis der Verknuepfung ist das Projektverzeichnis.'
