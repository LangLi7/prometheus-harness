#Requires -Version 7.0
<#
.SYNOPSIS
    Führt Reverse API Engineer mit einem Schlüssel aus dem PMH-Credential-Store aus.
.DESCRIPTION
    Dünner Wrapper um rae-run.mjs: Der Schlüssel wird im Node-Prozess aus
    $DSH_HOME/.credentials.yaml aufgelöst und nur als Umgebungsvariable an RAE
    übergeben. Er erscheint weder als Argument noch in der Ausgabe.
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts/rae-run.ps1 -Prompt "Jobs erfassen" -Url https://example.com/jobs -Headless
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts/rae-run.ps1 -Prompt "Login verstehen" -DryRun -Credential ANTHROPIC_API_KEY
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Prompt,
    [string]$Url,
    [ValidateSet('claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5')]
    [string]$Model,
    [ValidateSet('claude', 'opencode', 'cursor', 'copilot')]
    [string]$Sdk,
    [string]$Credential = 'ANTHROPIC_API_KEY',
    [string]$OutDir,
    [int]$TimeoutMs = 900000,
    [switch]$Headless,
    [switch]$DryRun,
    [switch]$Stream
)

$ErrorActionPreference = 'Stop'

$node = (Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1).Source
if (-not $node) { throw 'node nicht gefunden.' }

$runner = Join-Path $PSScriptRoot 'rae-run.mjs'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "rae-run.mjs fehlt: $runner" }

$arguments = @($runner, '--prompt', $Prompt, '--credential', $Credential, '--timeout', $TimeoutMs)
if ($Url) { $arguments += @('--url', $Url) }
if ($Model) { $arguments += @('--model', $Model) }
if ($Sdk) { $arguments += @('--sdk', $Sdk) }
if ($Headless) { $arguments += '--headless' }
if ($DryRun) { $arguments += '--dry-run' }
if ($Stream) { $arguments += '--stream' }

& $node @arguments
exit $LASTEXITCODE
