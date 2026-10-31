#Requires -Version 7.0
<#
.SYNOPSIS
    Projiziert REA-Evidenz in eine ausgewählte View (summary, api-surface, page …).
.DESCRIPTION
    REA 6.7.0 akzeptiert in `inspect-analysis-view` die Quellen `inline` und
    `retained-evidence`, nicht `evidence-file`. Dieses Skript bettet die
    Evidenz byte-genau ein (kein JSON-Roundtrip, sonst passt die evidence_id
    nicht mehr) und ruft die View auf.
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts/inspect-view.ps1 -Evidence capture.json -View api-surface
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts/inspect-view.ps1 -Evidence app-evidence.json -View summary
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts/inspect-view.ps1 -Evidence app.json -View page -Collection modules -Limit 20
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Evidence,
    [ValidateSet('summary', 'api-surface', 'page', 'capture', 'environment-manifest', 'environment-state')]
    [string]$View = 'summary',
    [string]$Collection = 'modules',
    [int]$Offset = 0,
    [int]$Limit = 50,
    [string]$ViewJson,
    [string]$Out
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Evidence -PathType Leaf)) {
    throw "Evidenzdatei nicht gefunden: $Evidence"
}

$rea = (Get-Command -Name 'rea.cmd' -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1).Source
if (-not $rea) {
    $rea = (Get-Command -Name 'rea' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1).Source
}
if (-not $rea) {
    $candidate = Join-Path $env:APPDATA 'npm\rea.cmd'
    if (Test-Path -LiteralPath $candidate) { $rea = $candidate }
}
if (-not $rea) {
    throw 'rea nicht gefunden. Installation: pwsh -ExecutionPolicy Bypass -File scripts/install.ps1 -Rea'
}

if ($ViewJson) {
    $viewObject = $ViewJson
} elseif ($View -eq 'summary') {
    $viewObject = '{"kind":"summary"}'
} elseif ($View -eq 'page') {
    $viewObject = '{"kind":"page","collection":"' + $Collection + '","offset":' + $Offset + ',"limit":' + $Limit + '}'
} else {
    $viewObject = '{"kind":"' + $View + '","offset":' + $Offset + ',"limit":' + $Limit + '}'
}

# Byte-genau einbetten: ConvertFrom-Json/ConvertTo-Json würde Zahlen und
# Schlüsselreihenfolge verändern und die evidence_id entwerten.
$raw = Get-Content -LiteralPath $Evidence -Raw
$request = '{"source":{"kind":"inline","evidence":' + $raw + '},"view":' + $viewObject + '}'

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ('rea-view-' + [guid]::NewGuid().ToString('N') + '.json')
$errTemp = $temp + '.err'
try {
    Set-Content -LiteralPath $temp -Value $request -NoNewline -Encoding utf8
    $output = & $rea inspect-analysis-view $temp --json 2> $errTemp
    $exitCode = $LASTEXITCODE
    $stderr = if (Test-Path -LiteralPath $errTemp) { (Get-Content -LiteralPath $errTemp -Raw) } else { '' }
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $errTemp -Force -ErrorAction SilentlyContinue
}

$text = ($output | Out-String).Trim()

if ($Out) {
    Set-Content -LiteralPath $Out -Value $text -Encoding utf8
    Write-Host "View nach $Out geschrieben (exit $exitCode)." -ForegroundColor Cyan
} else {
    $text
}

if ($exitCode -ne 0) {
    if ($stderr) { Write-Host $stderr -ForegroundColor DarkGray }
    exit $exitCode
}
exit 0
