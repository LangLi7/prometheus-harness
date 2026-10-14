# Prueft die Schnittstellenflaeche des Hosts am LAUFENDEN Host.
#
# Nicht die Doku fragen, sondern den Prozess: welche Pfade antworten, mit welchem
# Status, und welche Kopfzeilen kommen zurueck.
param(
  [int]$Port = 5401,
  [int]$MaxSekunden = 45
)

$ErrorActionPreference = 'Continue'
$root = Join-Path (Split-Path -Parent $PSCommandPath) "..\..\.." | Resolve-Path | Select-Object -ExpandProperty Path
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
$log = Join-Path $env:TEMP "pmh-api-$Port.log"
$err = "$log.err"
Remove-Item $log, $err -ErrorAction SilentlyContinue

Write-Host "bun: $(& $bun --version)"
$proc = Start-Process -FilePath $bun `
  -ArgumentList @('apps/cli/src/main.ts', 'web', '--port', "$Port", '--no-open',
                  '--home', (Join-Path $root '.pmh-build\harness-home')) `
  -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $err -PassThru -NoNewWindow

$token = $null
for ($i = 1; $i -le $MaxSekunden; $i++) {
  Start-Sleep -Seconds 1
  $text = ''
  foreach ($f in @($log, $err)) { if (Test-Path $f) { $text += (Get-Content $f -Raw -ErrorAction SilentlyContinue) } }
  if ($text -match 'token=([A-Za-z0-9_\-]+)') { $token = $Matches[1]; break }
  if ($proc.HasExited) { Write-Host "Prozess endete nach ${i}s"; break }
}

if (-not $token) {
  Write-Host "KEIN Token - Host kam nicht hoch"
  Get-Content $err -ErrorAction SilentlyContinue | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" }
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  exit 1
}
Write-Host "Token gelesen - Host laeuft auf Port $Port"
Write-Host ""

# Sitzung mit Cookie aufbauen (der Weg, den ein Browser geht).
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try { Invoke-WebRequest -Uri "http://127.0.0.1:$Port/?token=$token" -UseBasicParsing -WebSession $session -TimeoutSec 10 | Out-Null } catch { }

function Probe([string]$method, [string]$path) {
  $uri = "http://127.0.0.1:$Port$path"
  try {
    $args = @{ Uri = $uri; UseBasicParsing = $true; WebSession = $session; TimeoutSec = 8; Method = $method; ErrorAction = 'Stop' }
    if ($method -eq 'POST') { $args['ContentType'] = 'application/json'; $args['Body'] = '{}' }
    $r = Invoke-WebRequest @args
    $type = $r.Headers['Content-Type']
    if ($type -is [array]) { $type = $type[0] }
    return "$($r.StatusCode) | $([Math]::Round($r.RawContentLength/1024,1)) KB | $type"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code) { return "$code" }
    return "FEHLER: $($_.Exception.Message.Substring(0, [Math]::Min(60, $_.Exception.Message.Length)))"
  }
}

Write-Host "=== Pfade, die die Oberflaeche braucht ==="
$paths = @(
  '/', '/healthz', '/api', '/api/health',
  '/api/sessions', '/api/workspaces', '/api/settings', '/api/models',
  '/api/agents', '/api/commands', '/api/skills', '/api/plugins',
  '/api/jobs', '/api/goal', '/api/terminal', '/api/files',
  '/api/credentials', '/api/account', '/api/telemetry'
)
foreach ($p in $paths) {
  Write-Host ("  {0,-24} {1}" -f $p, (Probe 'GET' $p))
}

Write-Host ""
Write-Host "=== Der Typert-Gateway (Aufrufe des Clients) ==="
foreach ($p in @('/typert', '/rpc', '/gateway', '/api/typert')) {
  Write-Host ("  {0,-24} {1}" -f $p, (Probe 'POST' $p))
}

Write-Host ""
Write-Host "=== Was liefert die Startseite an Pfaden mit? (Skript- und API-Verweise) ==="
$html = ''
try { $html = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -WebSession $session -TimeoutSec 10).Content } catch { }
if ($html) {
  $found = [regex]::Matches($html, 'src="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique -First 12
  Write-Host "  Skripte: $(($found) -join ', ')"
  $apiRefs = [regex]::Matches($html, '(/api/[A-Za-z0-9_\-/]*)') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique -First 10
  Write-Host "  API-Verweise im HTML: $(($apiRefs) -join ', ')"
  Write-Host "  HTML-Groesse: $($html.Length) Zeichen"
}

$proc | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-3) } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "(Host beendet)"
