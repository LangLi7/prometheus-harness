# Testet den Host unter Windows nativ mit eigenem Harness-Home.
#
# Hypothese: der Auflösungsanker für die Profil-Bündel zeigt ins Harness-Home
# (`DSH_HOME`). Steht dort eine fremde Installation, gewinnt sie über die
# Node-Auflösungskette — und die Kern-Einträge werden als version-inkompatibel
# deaktiviert. Mit einem eigenen Home (`C:\Users\Chang\.pmh`, das dem Projekt
# gehört) darf das nicht passieren.
#
# Es wird NICHTS an der fremden Installation geändert: nur eine Umgebungsvariable
# für diesen einen Prozess gesetzt.
param(
  [int]$Port = 5355,
  [string]$PmhHome = "$env:USERPROFILE\.pmh",
  [int]$MaxSekunden = 30
)

$ErrorActionPreference = 'Continue'
$root = Join-Path (Split-Path -Parent $PSCommandPath) "..\..\.." | Resolve-Path | Select-Object -ExpandProperty Path
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
$log = Join-Path $env:TEMP "pmh-ownhome-$Port.log"
$err = "$log.err"
Remove-Item $log, $err -ErrorAction SilentlyContinue

Write-Host "bun:      $(& $bun --version)"
Write-Host "DSH_HOME: $PmhHome  (nur fuer diesen Prozess)"
Write-Host "Projekt:  $root"

# Die Umgebungsvariable gilt fuer den gesamten Prozessbaum dieses Aufrufs.
$env:DSH_HOME = $PmhHome

$proc = Start-Process -FilePath $bun -ArgumentList @('apps/cli/src/main.ts', 'web', '--port', "$Port", '--no-open') `
  -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $err -PassThru -NoNewWindow

$token = $null
for ($i = 1; $i -le $MaxSekunden; $i++) {
  Start-Sleep -Seconds 1
  $text = ''
  foreach ($f in @($log, $err)) { if (Test-Path $f) { $text += (Get-Content $f -Raw -ErrorAction SilentlyContinue) } }
  if ($text -match 'token=([A-Za-z0-9_\-]+)') { $token = $Matches[1]; Write-Host "Token nach ${i}s"; break }
  if ($proc.HasExited) { Write-Host "Prozess endete nach ${i}s"; break }
}

$all = @()
foreach ($f in @($log, $err)) { if (Test-Path $f) { $all += Get-Content $f } }
$disables = ($all | Where-Object { $_ -match 'disabling profile plugin row' }).Count
Write-Host "deaktivierte Profil-Eintraege: $disables"
$all | Where-Object { $_ -match 'did not activate|core running' } | Select-Object -First 3 | ForEach-Object {
  Write-Host "  $($_.Substring(0, [Math]::Min(150, $_.Length)))"
}

if ($token) {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$Port/?token=$token" -UseBasicParsing -WebSession $session -TimeoutSec 10 | Out-Null
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -WebSession $session -TimeoutSec 10 -ErrorAction Stop
    Write-Host "GET / mit Cookie: $($r.StatusCode) / $($r.RawContentLength) B"
    Write-Host "Titel: $([regex]::Match($r.Content, '<title>([^<]*)</title>').Groups[1].Value)"
  } catch {
    Write-Host "GET / mit Cookie: $($_.Exception.Message)"
  }
} else {
  Write-Host "kein Token"
}

if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Write-Host "(beendet)" }
