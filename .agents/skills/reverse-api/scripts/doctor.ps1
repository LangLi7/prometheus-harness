#Requires -Version 7.0
<#
.SYNOPSIS
    Prüft die Werkzeuge für den reverse-api-Skill.
.DESCRIPTION
    Meldet Node, npm, Python, uv, rea, reverse-api-engineer, Chrome/Edge und den
    DSH-MCP-Client. Ändert nichts. Exit 1, wenn eine Grundvoraussetzung fehlt.
.EXAMPLE
    pwsh -File scripts/doctor.ps1
    pwsh -File scripts/doctor.ps1 -Json
#>
[CmdletBinding()]
param([switch]$Json)

$ErrorActionPreference = 'SilentlyContinue'

function Get-ToolInfo {
    param(
        [string]$Name,
        [string[]]$VersionArgs = @('--version')
    )

    $cmd = Get-Command -Name $Name -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $cmd) {
        return [pscustomobject]@{ name = $Name; found = $false; path = $null; version = $null }
    }

    $version = $null
    try {
        $first = & $cmd.Source @VersionArgs 2>$null | Select-Object -First 1
        if ($null -ne $first) { $version = ([string]$first).Trim() }
    } catch {
        $version = $null
    }

    # Fallback ohne Prozessstart: Dateiversion lesen (funktioniert auch, wenn
    # die Umgebung Subprozesse blockiert).
    if ([string]::IsNullOrWhiteSpace([string]$version)) {
        try {
            $info = (Get-Item -LiteralPath $cmd.Source -ErrorAction Stop).VersionInfo
            if ($info.ProductVersion) { $version = $info.ProductVersion }
            elseif ($info.FileVersion) { $version = $info.FileVersion }
        } catch {
            $version = $null
        }
    }

    return [pscustomobject]@{ name = $Name; found = $true; path = $cmd.Source; version = $version }
}

function Find-FirstFile {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

$node = Get-ToolInfo -Name 'node'
$npm = Get-ToolInfo -Name 'npm.cmd'
$python = Get-ToolInfo -Name 'python'
$uv = Get-ToolInfo -Name 'uv'
$rea = Get-ToolInfo -Name 'rea.cmd'
if (-not $rea.found) { $rea = Get-ToolInfo -Name 'rea' }
$rae = Get-ToolInfo -Name 'reverse-api-engineer'

$browser = Find-FirstFile -Candidates @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)

$mcpClient = $null
if ($env:DSH_PROFILE_DIR) {
    $mcpClient = Find-FirstFile -Candidates @(
        (Join-Path $env:DSH_PROFILE_DIR 'node_modules\@deepseek-ai\dsh-mcp-client\package.json')
    )
}

$checks = [ordered]@{
    node            = $node
    npm             = $npm
    python          = $python
    uv              = $uv
    rea             = $rea
    rae             = $rae
}
foreach ($key in $checks.Keys) {
    $value = $checks[$key]
    $value | Add-Member -NotePropertyName role -NotePropertyValue $key -Force
}

$result = [pscustomobject]@{
    ok               = [bool]($node.found -and $python.found)
    node_major       = if ($node.version -match 'v?(\d+)\.') { [int]$Matches[1] } else { $null }
    rea_installed    = [bool]$rea.found
    rae_installed    = [bool]$rae.found
    uv_installed     = [bool]$uv.found
    browser_path     = $browser
    dsh_mcp_client   = [bool]$mcpClient
    checks           = @($checks.Values)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
} else {
    foreach ($check in $result.checks) {
        $state = if ($check.found) { 'ok  ' } else { 'FEHLT' }
        if ($check.found) {
            $version = if ([string]::IsNullOrWhiteSpace([string]$check.version)) { '(Version unbekannt)' } else { $check.version }
            $detail = "$version  $($check.path)"
        } else {
            $detail = ''
        }
        '{0,-6} {1,-22} {2}' -f $state, $check.name, $detail
    }
    $browserDetail = if ($browser) { $browser } else { 'nicht gefunden (RAE bringt eigenen Chromium mit)' }
    '{0,-6} {1,-22} {2}' -f $(if ($browser) { 'ok  ' } else { '--  ' }), 'browser', $browserDetail
    '{0,-6} {1,-22} {2}' -f $(if ($result.dsh_mcp_client) { 'ok  ' } else { 'FEHLT' }), 'dsh-mcp-client', $(if ($result.dsh_mcp_client) { 'REA als MCP möglich' } else { 'nur CLI-Weg (siehe references/dsh-mcp-plugin.md)' })

    if (-not $result.ok) { 'Grundvoraussetzung fehlt: node und python werden gebraucht.' }
    if (-not $rea.found) { 'Hinweis: rea fehlt -> pwsh -ExecutionPolicy Bypass -File scripts/install.ps1 -Rea' }
    if (-not $rae.found) { 'Hinweis: reverse-api-engineer fehlt -> pwsh -ExecutionPolicy Bypass -File scripts/install.ps1 -Rae' }
}

if (-not $result.ok) { exit 1 }
exit 0
