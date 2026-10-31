#Requires -Version 7.0
<#
.SYNOPSIS
    Installiert REA und/oder Reverse API Engineer.
.DESCRIPTION
    REA wird als npm-Paket installiert (standardmäßig global, damit `rea` im PATH liegt),
    Reverse API Engineer als uv-Tool. Das Skript umgeht die Windows-Sperre für npm.ps1,
    indem es npm.cmd oder direkt die npm-cli.js über node aufruft.
.EXAMPLE
    pwsh -File scripts/install.ps1 -All
    pwsh -File scripts/install.ps1 -Rae -Manual
    pwsh -File scripts/install.ps1 -Rea -ReaVersion 6.7.0 -Prefix .tools\rea
#>
[CmdletBinding()]
param(
    [switch]$Rea,
    [switch]$Rae,
    [switch]$All,
    [switch]$Manual,
    [string]$ReaVersion = '6.7.0',
    [string]$Prefix = '',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if ($All) { $Rea = $true; $Rae = $true }
if (-not $Rea -and -not $Rae) {
    throw 'Nichts zu tun: -Rea, -Rae oder -All angeben.'
}

function Resolve-NpmInvocation {
    $npmCmd = Get-Command -Name 'npm.cmd' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($npmCmd) {
        return @{ file = $npmCmd.Source; prefixArgs = @() }
    }

    $node = Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $node) { throw 'Weder npm.cmd noch node gefunden.' }

    $npmCli = Join-Path (Split-Path -Parent $node.Source) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) {
        throw "npm-cli.js nicht gefunden unter $npmCli"
    }
    return @{ file = $node.Source; prefixArgs = @($npmCli) }
}

function Invoke-Npm {
    param([string[]]$Arguments)

    $invocation = Resolve-NpmInvocation
    $full = @($invocation.prefixArgs) + $Arguments
    Write-Host "npm $($full -join ' ')" -ForegroundColor DarkGray
    if ($DryRun) { return 0 }
    & $invocation.file @full
    return $LASTEXITCODE
}

function Invoke-Uv {
    param([string[]]$Arguments)

    $uv = Get-Command -Name 'uv' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $uv) { throw 'uv nicht gefunden. Installation: https://docs.astral.sh/uv/' }
    Write-Host "uv $($Arguments -join ' ')" -ForegroundColor DarkGray
    if ($DryRun) { return 0 }
    & $uv.Source @Arguments
    return $LASTEXITCODE
}

$failed = @()

if ($Rea) {
    $package = "rea-agents@$ReaVersion"
    $npmArgs = @('install', '--no-audit', '--no-fund')
    if ($Prefix) {
        $resolvedPrefix = [System.IO.Path]::GetFullPath($Prefix)
        $npmArgs += @('--prefix', $resolvedPrefix)
        Write-Host "REA nach $resolvedPrefix" -ForegroundColor Cyan
    } else {
        $npmArgs += '--global'
        Write-Host 'REA global installieren' -ForegroundColor Cyan
    }
    $npmArgs += $package

    $code = Invoke-Npm -Arguments $npmArgs
    if ($code -ne 0) { $failed += "REA (npm exit $code)" }
}

if ($Rae) {
    $spec = if ($Manual) { 'reverse-api-engineer[manual]' } else { 'reverse-api-engineer' }
    Write-Host "RAE installieren: $spec" -ForegroundColor Cyan
    $code = Invoke-Uv -Arguments @('tool', 'install', $spec)
    if ($code -ne 0) { $failed += "RAE (uv exit $code)" }
    if ($Manual -and -not $DryRun) {
        Write-Host 'Playwright-Chromium für den manuellen Modus installieren' -ForegroundColor Cyan
        $code = Invoke-Uv -Arguments @('tool', 'run', '--from', 'reverse-api-engineer', 'playwright', 'install', 'chromium')
        if ($code -ne 0) { $failed += "Playwright-Browser (exit $code)" }
    }
}

if ($DryRun) {
    Write-Host 'Dry-Run: nichts installiert.' -ForegroundColor Yellow
    exit 0
}

# PATH der aktuellen Sitzung auffrischen, damit die Prüfung unten greift.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path

Write-Host ''
Write-Host 'Prüfung:' -ForegroundColor Cyan
foreach ($tool in @('rea', 'reverse-api-engineer')) {
    $names = if ($tool -eq 'rea') { @('rea.cmd', 'rea') } else { @($tool) }
    $cmd = $null
    foreach ($name in $names) {
        $cmd = Get-Command -Name $name -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($cmd) { break }
    }
    if ($cmd) {
        $version = & $cmd.Source --version 2>$null | Select-Object -First 1
        Write-Host ("  ok    {0}  {1}" -f $tool, $version) -ForegroundColor Green
    } else {
        Write-Host ("  fehlt {0}" -f $tool) -ForegroundColor Yellow
        if (-not $failed -or $failed.Count -eq 0) { $failed += "$tool nicht im PATH" }
    }
}

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host ('Fehlgeschlagen: ' + ($failed -join ', ')) -ForegroundColor Red
    exit 1
}

exit 0
