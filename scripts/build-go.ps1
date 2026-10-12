#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Baut die Go-Dienste des Prometheus Harness.

.DESCRIPTION
    Baut alle Dienste unter services/, die eine go.mod besitzen, oder einen
    einzelnen mit -Service.

    -buildvcs=false wird immer gesetzt: das .git im Zielprojekt ist defekt
    ("fatal: not a git repository"), und Go versucht sonst VCS-Stamping und
    scheitert mit "error obtaining VCS status: exit status 128".

.PARAMETER Service
    Name eines einzelnen Dienstes (Ordnername unter services/). Ohne Angabe
    werden alle gebaut.

.PARAMETER Release
    Baut mit -ldflags "-s -w" (kleinere Binaries).

.EXAMPLE
    .\scripts\build-go.ps1
    .\scripts\build-go.ps1 -Service pmh-supervisor
    .\scripts\build-go.ps1 -Release
#>
[CmdletBinding()]
param(
    [string]$Service,
    [switch]$Release
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$servicesDir = Join-Path $root 'services'

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Error 'go ist nicht im PATH. Go 1.26 oder neuer wird gebraucht.'
}

# Alle Dienstordner mit eigener go.mod finden.
$modules = Get-ChildItem -Path $servicesDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'go.mod') }

if ($Service) {
    $modules = $modules | Where-Object { $_.Name -eq $Service }
    if (-not $modules) {
        Write-Error "Kein Go-Dienst namens '$Service' unter services/ gefunden."
    }
}

if (-not $modules) {
    Write-Host 'Keine Go-Dienste gefunden.' -ForegroundColor Yellow
    exit 0
}

$common = @('build', '-buildvcs=false')
if ($Release) { $common += @('-ldflags', '-s -w') }

$failed = @()
foreach ($m in $modules) {
    Write-Host "==> $($m.Name)" -ForegroundColor Cyan
    Push-Location $m.FullName
    try {
        & go @common ./... 2>&1 | ForEach-Object { Write-Host "    $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    FEHLGESCHLAGEN (exit $LASTEXITCODE)" -ForegroundColor Red
            $failed += $m.Name
        }
        else {
            Write-Host '    ok' -ForegroundColor Green
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host ''
if ($failed.Count -gt 0) {
    Write-Host "Fehlgeschlagen: $($failed -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "Gebaut: $($modules.Count) Dienst(e)." -ForegroundColor Green
exit 0
