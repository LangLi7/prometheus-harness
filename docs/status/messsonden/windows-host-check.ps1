# Prüft den Host unter Windows nativ und fängt ALLE Ausgabe ein — auch wenn der
# Prozess lange läuft. Ziel: die Version, die der Loader tatsächlich auflöst.
param(
  [int]$Port = 5333,
  [int]$MaxSekunden = 30
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
$log = Join-Path $env:TEMP "pmh-win2-$Port.log"
$err = "$log.err"
Remove-Item $log, $err -ErrorAction SilentlyContinue

Write-Host "bun: $(& $bun --version)"
Write-Host "cwd: $root"
Write-Host "DSH_HOME: $env:DSH_HOME"

$proc = Start-Process -FilePath $bun -ArgumentList @('apps/cli/src/main.ts', 'web', '--port', "$Port") `
  -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $err -PassThru -NoNewWindow

$start = Get-Date
while (-not $proc.HasExited -and ((Get-Date) -lt $start.AddSeconds($MaxSekunden))) {
  Start-Sleep -Milliseconds 500
}

Write-Host "=== nach $([math]::Round(((Get-Date) - $start).TotalSeconds,1))s: exited=$($proc.HasExited) ==="

$all = @()
foreach ($f in @($log, $err)) { if (Test-Path $f) { $all += Get-Content $f } }
Write-Host "ausgabe-Zeilen: $($all.Count)"

# Die entscheidenden Zeilen: Version, Deaktivierung, Pflicht-Einträge
$interesting = $all | Where-Object {
  $_ -match 'disabling profile plugin row|Core läuft|startup failed|did not activate|dsh web:|warnung|warning|Error:'
}
Write-Host "=== wesentliche Zeilen (gekürzt auf 200 Zeichen) ==="
$interesting | Select-Object -First 25 | ForEach-Object {
  $line = $_
  if ($line.Length -gt 200) { $line = $line.Substring(0, 200) + '…' }
  Write-Host "  $line"
}

Write-Host "=== gibt es ein Token? ==="
$tokenLine = $all | Where-Object { $_ -match 'token=' } | Select-Object -First 1
if ($tokenLine) { Write-Host "  ja: $($tokenLine.Substring(0, [Math]::Min(90, $tokenLine.Length)))" } else { Write-Host "  nein" }

if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Write-Host "(Prozess beendet)" }
else { Write-Host "Exitcode: $($proc.ExitCode)" }
