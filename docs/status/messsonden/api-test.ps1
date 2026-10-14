# Startet den Host und ruft die API-Sonde dagegen auf.
param([int]$Port = 5411, [int]$MaxSekunden = 45)

$ErrorActionPreference = 'Continue'
$repo = (Join-Path (Split-Path -Parent $PSCommandPath) "..\..\..") | Resolve-Path | Select-Object -ExpandProperty Path
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
$log = Join-Path $env:TEMP "pmh-sonde-$Port.log"
Remove-Item $log, "$log.err" -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $bun `
  -ArgumentList @('apps/cli/src/main.ts', 'web', '--port', "$Port", '--no-open',
                  '--home', (Join-Path $repo '.pmh-build\harness-home')) `
  -WorkingDirectory $repo -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -NoNewWindow

$token = $null
for ($i = 1; $i -le $MaxSekunden; $i++) {
  Start-Sleep -Seconds 1
  $text = ''
  foreach ($f in @($log, "$log.err")) { if (Test-Path $f) { $text += (Get-Content $f -Raw -ErrorAction SilentlyContinue) } }
  if ($text -match 'token=([A-Za-z0-9_\-]+)') { $token = $Matches[1]; break }
  if ($proc.HasExited) { break }
}
if (-not $token) {
  Write-Host "Kein Token - Host kam nicht hoch"
  Get-Content "$log.err" -ErrorAction SilentlyContinue | Select-Object -Last 4 | ForEach-Object { Write-Host "  $_" }
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  exit 1
}

& $bun (Join-Path $repo 'docs\status\messsonden\api-sonde.ts') "$Port" "$token" 2>&1 | ForEach-Object { Write-Host $_ }

$proc | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-3) } | Stop-Process -Force -ErrorAction SilentlyContinue
