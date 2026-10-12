# Takt: Arbeitsstand sichern, pushen, auditieren.
#
# Warum ein Skript und keine Handarbeit: ein Takt, der aus fünf von Hand
# getippten Befehlen besteht, wird irgendwann unvollständig ausgeführt — und
# dann fehlt genau der Nachweis, der ihn wertvoll macht. Dieses Skript macht
# den Ablauf wiederholbar und schreibt das Audit selbst.
#
# Aufruf:
#   pwsh -ExecutionPolicy Bypass -File scripts/takt.ps1 -Message "Kurzbeschreibung"
#   pwsh -ExecutionPolicy Bypass -File scripts/takt.ps1 -Message "..." -DryRun
#
# Es committet NUR, was ausdrücklich genannt ist (Standard: Doku und Host).
# Halbfertige Arbeit laufender Arbeitspakete wird bewusst NICHT mitgenommen
# (docs/status/arbeitspakete.md, Regel A6).

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Message,

  # Nur zeigen, was passieren würde.
  [switch]$DryRun,

  # Zusätzliche Pfade, die mitgenommen werden sollen (z. B. ein fertiges Paket).
  [string[]]$Include = @(),

  # Auch das Takt-Skript selbst mitnehmen (bei seiner eigenen Änderung nötig,
  # sonst stünde das Skript nie im Repository).
  [switch]$IncludeSelf
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "  OK   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  WARN $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "  FEHL $text" -ForegroundColor Red }

Step 'Repository prüfen'
if (-not (Test-Path (Join-Path $repo '.git/HEAD'))) {
  Fail '.git/HEAD fehlt — dieses Verzeichnis ist kein Git-Repository.'
  exit 1
}
$branch = git branch --show-current
Ok "Branch: $branch"

if ((git status --porcelain | Measure-Object).Count -eq 0) {
  Warn 'Keine Änderungen — nichts zu tun.'
  exit 0
}

Step 'Ausgewählte Pfade stagen'
$paths = @('docs/') + $Include
if ($IncludeSelf) { $paths += 'scripts/takt.ps1' }
foreach ($p in $paths) {
  if (Test-Path $p) {
    git add -- $p
    Ok "gestaged: $p"
  } else {
    Warn "übersprungen (nicht vorhanden): $p"
  }
}

Step 'Was geht in den Commit?'
$staged = git diff --cached --name-only
if (($staged | Measure-Object).Count -eq 0) {
  Warn 'Nichts gestaged — Abbruch ohne Commit.'
  exit 0
}
$staged | ForEach-Object { Write-Host "    $_" }

Step 'Bewusst NICHT im Commit (halbfertige Arbeit)'
$unstaged = git status --porcelain | Where-Object { $_ -notmatch '^[AM]' }
if (($unstaged | Measure-Object).Count -gt 0) {
  $unstaged | ForEach-Object { Write-Host "    $_" }
} else {
  Write-Host '    (nichts)'
}

if ($DryRun) {
  Warn 'DryRun — kein Commit, kein Push.'
  exit 0
}

Step 'Commit'
git commit -q -m $Message
if ($LASTEXITCODE -ne 0) { Fail "Commit fehlgeschlagen (exit $LASTEXITCODE)"; exit 1 }
$head = git rev-parse HEAD
Ok "HEAD: $($head.Substring(0,8))"

Step 'Push'
git push 2>&1 | ForEach-Object { Write-Host "    $_" }
if ($LASTEXITCODE -ne 0) { Fail "Push fehlgeschlagen (exit $LASTEXITCODE)"; exit 1 }

Step 'Audit — lokal gegen Remote'
$local  = git rev-parse HEAD
$remote = git rev-parse origin/$branch
if ($local -ne $remote) {
  Fail "lokal ($($local.Substring(0,8))) und origin/$branch ($($remote.Substring(0,8))) stimmen NICHT überein"
  exit 1
}
Ok "lokal = origin/$branch = $($local.Substring(0,8))"

$api = gh api "repos/LangLi7/prometheus-harness/commits/$branch" --jq '.sha[0:8] + " " + .commit.author.date' 2>$null
if ($api) { Ok "GitHub-API bestätigt: $api" } else { Warn 'API-Abfrage nicht möglich (gh nicht angemeldet?)' }

Step 'Ergebnis'
$count = (git ls-files | Measure-Object).Count
Write-Host "  Commit  : $($local.Substring(0,8))"
Write-Host "  Branch  : $branch"
Write-Host "  Dateien : $count"
Write-Host ''
Write-Host '  NÄCHSTER SCHRITT (nicht automatisiert, weil er Urteilsvermögen braucht):' -ForegroundColor Yellow
Write-Host '    Einen Eintrag in docs/status/git-audit.md ergänzen — Datum, HEAD,'
Write-Host '    Dateizahl und die Prüfergebnisse. Ein Push ohne Eintrag gilt als nicht erfolgt.'
