#Requires -Version 7.0
<#
.SYNOPSIS
    Schaltet REA als MCP-Server in DeepSeek Harness frei (optionaler Plugin-Weg).
.DESCRIPTION
    Prüft Voraussetzungen, zeigt den Setup-Plan von REA für den DSH-Client und
    wendet ihn mit -Apply an. Ein Neustart von DSH ist danach nötig.
    Ohne @deepseek-ai/dsh-mcp-client im Profil bricht das Skript ab, weil der
    Cordis-Patch sonst nicht lädt.
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts/enable-rea-mcp.ps1
    pwsh -ExecutionPolicy Bypass -File scripts/enable-rea-mcp.ps1 -Apply
#>
[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'

$rea = Get-Command -Name 'rea.cmd' -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $rea) {
    $rea = Get-Command -Name 'rea' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
}
if (-not $rea) {
    Write-Host 'rea fehlt. Zuerst: pwsh -ExecutionPolicy Bypass -File scripts/install.ps1 -Rea' -ForegroundColor Red
    exit 2
}

if (-not $env:DSH_PROFILE_DIR) {
    Write-Host 'DSH_PROFILE_DIR ist nicht gesetzt; wird dieses Skript außerhalb von DSH ausgeführt?' -ForegroundColor Yellow
}

$mcpClient = $null
if ($env:DSH_PROFILE_DIR) {
    $mcpClient = Join-Path $env:DSH_PROFILE_DIR 'node_modules\@deepseek-ai\dsh-mcp-client\package.json'
}

if (-not $mcpClient -or -not (Test-Path -LiteralPath $mcpClient -PathType Leaf)) {
    Write-Host 'Voraussetzung fehlt: @deepseek-ai/dsh-mcp-client ist im Profil nicht installiert.' -ForegroundColor Red
    Write-Host 'Ohne dieses Paket lädt der Cordis-Patch nicht. Siehe references/dsh-mcp-plugin.md.'
    Write-Host 'Beispiel (Version an das Profil anpassen):'
    Write-Host '  npm install --prefix "$env:DSH_PROFILE_DIR" "@deepseek-ai/dsh-mcp-client@0.2.1-alpha.2"'
    exit 2
}

Write-Host 'Setup-Plan (schreibt nichts):' -ForegroundColor Cyan
$plan = & $rea.Source setup --client dsh --dry-run --json
$planExit = $LASTEXITCODE
$plan
if ($planExit -ne 0) {
    Write-Host "Plan fehlgeschlagen (exit $planExit)." -ForegroundColor Red
    exit $planExit
}

if (-not $Apply) {
    Write-Host ''
    Write-Host 'Nichts geändert. Zum Anwenden erneut mit -Apply ausführen; danach DSH neu starten.'
    exit 0
}

Write-Host ''
Write-Host 'Wende Setup an …' -ForegroundColor Cyan
& $rea.Source setup --client dsh --yes
$applyExit = $LASTEXITCODE
if ($applyExit -ne 0) {
    Write-Host "Setup fehlgeschlagen (exit $applyExit)." -ForegroundColor Red
    exit $applyExit
}

Write-Host ''
Write-Host 'Fertig. DSH neu starten; danach müssen mcp__rea__* Werkzeuge erscheinen.' -ForegroundColor Green
Write-Host 'Prüfung: rea doctor --client dsh --json'
exit 0
