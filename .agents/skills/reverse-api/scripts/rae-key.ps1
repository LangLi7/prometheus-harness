#Requires -Version 7.0
<#
.SYNOPSIS
    Speichert einen API-Schlüssel im PMH-Credential-Store, ohne ihn anzuzeigen.
.DESCRIPTION
    Liest den Schlüssel als SecureString ein, übergibt ihn über eine
    Umgebungsvariable an credentials-set.mjs und löscht die Zwischenkopie
    anschließend. Der Wert wird nie ausgegeben und steht nicht in der
    Prozessliste. Danach findet ihn RAE über rae-run.ps1.
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts/rae-key.ps1
    pwsh -ExecutionPolicy Bypass -File scripts/rae-key.ps1 -Name ANTHROPIC_API_KEY
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z_][A-Za-z0-9_]*$')]
    [string]$Name = 'ANTHROPIC_API_KEY'
)

$ErrorActionPreference = 'Stop'

$node = (Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1).Source
if (-not $node) { throw 'node nicht gefunden.' }

$setter = Join-Path $PSScriptRoot 'credentials-set.mjs'
if (-not (Test-Path -LiteralPath $setter -PathType Leaf)) { throw "credentials-set.mjs fehlt: $setter" }

$secure = Read-Host -AsSecureString -Prompt "Schlüssel für $Name (Eingabe bleibt unsichtbar)"
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $env:RAE_SECRET_VALUE = $plain
    & $node $setter $Name
    $code = $LASTEXITCODE
} finally {
    Remove-Item Env:RAE_SECRET_VALUE -ErrorAction SilentlyContinue
    if ($bstr -ne [IntPtr]::Zero) { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $plain = $null
}

if ($code -ne 0) {
    Write-Host "Speichern fehlgeschlagen (exit $code)." -ForegroundColor Red
    exit $code
}

Write-Host "Gespeichert als $Name. Prüfen: rae-run.ps1 -DryRun" -ForegroundColor Green
exit 0
