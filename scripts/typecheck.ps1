# Typprüfung des gesamten TypeScript-Backends mit TypeScript 7 (`tsgo --noEmit`).
#
# Regel aus docs/stack.md: Bun *führt aus*, TS 7 *prüft*. Es gibt keinen
# Transpiliationsschritt und kein `tsc` — dieses Skript ruft ausschließlich `tsgo`.
#
# Aufruf aus dem Repo-Wurzelverzeichnis:
#   pwsh -File scripts/typecheck.ps1
#   pwsh -File scripts/typecheck.ps1 -Filter home-paths
#
# `apps/web` bringt ein eigenes node_modules mit. Dieses Skript installiert
# nichts und schreibt nichts — es setzt nur den Pfad auf dessen `tsgo`, weil
# der Wurzel-Arbeitsbereich kein eigenes node_modules hat.

[CmdletBinding()]
param(
    # Nur Pakete prüfen, deren Ordnername diesen Text enthält.
    [string]$Filter = '',
    # Nur den Wurzelpfad melden, nichts ausführen.
    [switch]$ListOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$webBin = Join-Path $root 'apps\web\node_modules\.bin'

if (-not (Test-Path $webBin)) {
    throw "tsgo nicht gefunden: $webBin fehlt. apps/web muss einmal installiert worden sein (bun install in apps/web)."
}

$env:PATH = "$webBin;$env:PATH"

$packages = Get-ChildItem -Path (Join-Path $root 'packages') -Directory |
    ForEach-Object { Get-ChildItem -Path $_.FullName -Directory } |
    Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } |
    Sort-Object FullName

if ($Filter) {
    $packages = $packages | Where-Object { $_.Name -like "*$Filter*" }
}

if ($ListOnly) {
    $packages | ForEach-Object { $_.FullName }
    return
}

$failed = @()
$checked = 0

foreach ($package in $packages) {
    $checked++
    Push-Location $package.FullName
    try {
        $output = & tsgo --noEmit 2>&1
        if ($LASTEXITCODE -ne 0) {
            $failed += $package.FullName
            Write-Host "FAIL  $($package.FullName)" -ForegroundColor Red
            $output | ForEach-Object { Write-Host "      $_" }
        }
        else {
            Write-Host "ok    $($package.FullName)" -ForegroundColor Green
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host ''
Write-Host "tsgo --noEmit: $checked Pakete geprüft, $($failed.Count) fehlgeschlagen."

if ($failed.Count -gt 0) {
    exit 1
}
