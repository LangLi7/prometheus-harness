# Tests aller TypeScript-Pakete mit `bun test`.
#
# Regel aus docs/stack.md: Bun führt TypeScript direkt aus — die Tests laufen
# ohne Übersetzungsschritt. Dieses Skript installiert nichts und schreibt
# nichts; `apps/web` wird nicht angefasst.
#
# Aufruf aus dem Repo-Wurzelverzeichnis:
#   pwsh -File scripts/test.ps1
#   pwsh -File scripts/test.ps1 -Filter tools

[CmdletBinding()]
param(
    # Nur Pakete testen, deren Ordnername diesen Text enthält.
    [string]$Filter = '',
    # Nur die Paketpfade melden, nichts ausführen.
    [switch]$ListOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$packages = Get-ChildItem -Path (Join-Path $root 'packages') -Directory |
    ForEach-Object { Get-ChildItem -Path $_.FullName -Directory } |
    Where-Object {
        Test-Path (Join-Path $_.FullName 'package.json') -and
        (Test-Path (Join-Path $_.FullName 'tests'))
    } |
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
        $output = & bun test 2>&1
        if ($LASTEXITCODE -ne 0) {
            $failed += $package.FullName
            Write-Host "FAIL  $($package.FullName)" -ForegroundColor Red
            $output | ForEach-Object { Write-Host "      $_" }
        }
        else {
            $summary = $output | Select-String -Pattern '^\s*\d+ pass' | Select-Object -First 1
            Write-Host "ok    $($package.FullName)  ($($summary -replace '^\s+', ''))" -ForegroundColor Green
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host ''
Write-Host "bun test: $checked Pakete getestet, $($failed.Count) fehlgeschlagen."

if ($failed.Count -gt 0) {
    exit 1
}
