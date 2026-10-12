#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Prueft und testet die Go-Dienste des Prometheus Harness.

.DESCRIPTION
    Fuehrt je Dienst `go vet ./...` und `go test ./...` aus — oder nur fuer einen
    mit -Service. Beide Schritte laufen mit -buildvcs=false, weil das .git im
    Zielprojekt defekt ist und Go sonst am VCS-Stamping scheitert.

    Die Ausgabe ist bewusst knapp: je Dienst und Schritt eine Zeile mit dem
    Ergebnis, damit ein roter Lauf sofort sichtbar ist. Mit -Verbose wird die
    vollstaendige Testausgabe gezeigt.

.PARAMETER Service
    Name eines einzelnen Dienstes. Ohne Angabe werden alle geprueft.

.PARAMETER SkipVet
    Ueberspringt `go vet`.

.EXAMPLE
    .\scripts\test-go.ps1
    .\scripts\test-go.ps1 -Service pmh-supervisor -Verbose
#>
[CmdletBinding()]
param(
    [string]$Service,
    [switch]$SkipVet
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$servicesDir = Join-Path $root 'services'

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Error 'go ist nicht im PATH. Go 1.26 oder neuer wird gebraucht.'
}

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

$results = @()

foreach ($m in $modules) {
    Push-Location $m.FullName
    try {
        if (-not $SkipVet) {
            $vetOut = & go vet -buildvcs=false ./... 2>&1
            $vetCode = $LASTEXITCODE
            if ($vetCode -eq 0) {
                Write-Host ("{0,-18} vet   ok" -f $m.Name) -ForegroundColor Green
            }
            else {
                Write-Host ("{0,-18} vet   FEHLER (exit {1})" -f $m.Name, $vetCode) -ForegroundColor Red
                $vetOut | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
            }
            $results += [pscustomobject]@{ Service = $m.Name; Step = 'vet'; Code = $vetCode }
        }

        $testOut = & go test -buildvcs=false ./... 2>&1
        $testCode = $LASTEXITCODE
        $fails = @($testOut | Where-Object { $_ -match '^--- FAIL' }).Count
        if ($testCode -eq 0) {
            Write-Host ("{0,-18} test  ok" -f $m.Name) -ForegroundColor Green
        }
        else {
            Write-Host ("{0,-18} test  {1} Test(s) rot (exit {2})" -f $m.Name, $fails, $testCode) -ForegroundColor Red
            $testOut | Where-Object { $_ -match '^(--- FAIL|\s+\S+_test\.go:)' } |
                ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        }
        if ($VerbosePreference -eq 'Continue') {
            $testOut | ForEach-Object { Write-Host "      $_" }
        }
        $results += [pscustomobject]@{ Service = $m.Name; Step = 'test'; Code = $testCode }
    }
    finally {
        Pop-Location
    }
}

Write-Host ''
$bad = @($results | Where-Object { $_.Code -ne 0 })
$results | Format-Table -AutoSize | Out-String | Write-Host

if ($bad.Count -gt 0) {
    Write-Host "$($bad.Count) Schritt(e) fehlgeschlagen:" -ForegroundColor Red
    $bad | ForEach-Object { Write-Host "  $($_.Service) / $($_.Step)" -ForegroundColor Red }
    exit 1
}
Write-Host 'Alles gruen.' -ForegroundColor Green
exit 0
