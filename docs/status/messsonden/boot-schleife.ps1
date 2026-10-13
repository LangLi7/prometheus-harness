# =============================================================================
# Misst die Boot-Schleife des eigenen Cores — an UNSEREM Code.
# =============================================================================
#
# **Der Anlass.** In `docs/risks.md` stand: "der Typecheck laeuft mit TS 7
# fehlerfrei (12,7 s statt 129,7 s)" — als Beleg, dass es uns weniger trifft. Der
# Betreiber hat den Fehler benannt: dieser Wert stammt aus einem Test, bei dem
# **DSH-Code** mit TypeScript 7 kompiliert wurde. TS 7 ist der native Compiler,
# der in **Go** geschrieben ist. Der Wert misst **den Compiler**, nicht unser
# Projekt.
#
# **Gemessen wird die Reihenfolge, die der Betreiber vorgibt:**
#
#     bun install          # statt pnpm install
#     tsgo --noEmit        # Typecheck mit TS7 (Go-Compiler), ueber 17 Pakete
#     bun run src/main.ts  # Start direkt, ohne Build-Schritt
#
# Jeder Schritt dreimal: eine Einzelmessung ist keine Messung (Register, P6:
# 35 s waren ein Kaltstart).
#
# **Was diese Sonde NICHT ist:** kein Test. Sie schreibt in keine Datei, sie
# startet den Host und beendet ihn wieder.
#
# =============================================================================

$ErrorActionPreference = 'Continue'
# **Der eigene Fehler, der hier behoben ist (gemessen, 13.10.2026).** In der
# ersten Fassung stand `Split-Path -Parent $PSCommandPath`. Das liefert den
# Ordner der Sonde — `docs/status/messsonden` — und **nicht** das Repository.
# `Push-Location` wechselte also dorthin, und alle 17 Paketpfade wurden relativ
# zu diesem Ordner aufgeloest. Ergebnis: 17 von 17 Paketen "rot", mit der Meldung
# "The specified path does not exist".
#
# **Das ist genau die Falle, vor der der Betreiber gewarnt hat** (der 12,7-s-Wert,
# der den Compiler mass und nicht das Projekt): eine Zahl, die plausibel aussieht
# und etwas ganz anderes misst als behauptet. Ohne die Ausgabe der Meldungen
# haette ich "17 Pakete rot" geglaubt.
#
# Drei Ebenen hoch: messsonden -> status -> docs -> Repository.
$repo = (Resolve-Path (Join-Path (Split-Path -Parent $PSCommandPath) '..\..\..')).Path
Push-Location $repo
$env:PATH = (Join-Path $env:USERPROFILE '.bun\bin') + ';' + $env:PATH
$BUN = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'

$tsconfigs = @(
  'packages/llm/llm', 'packages/llm/llm-deepseek', 'packages/llm/llm-retry', 'packages/llm/token-meter',
  'packages/core/agent-tools', 'packages/core/agent-loop',
  'packages/agent/session-format', 'packages/agent/session-persistence-jsonl',
  'packages/auth/auth', 'packages/auth/db-schema',
  'packages/units/unit-export', 'packages/util/atomic-write', 'packages/util/home-paths', 'packages/core/scope',
  'apps/cli', 'apps/web', 'tests'
)

Write-Host "=== 1. bun install (dreimal) ==="
for ($i = 1; $i -le 3; $i++) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $o = & $BUN install --frozen-lockfile 2>&1
  $code = $LASTEXITCODE
  $sw.Stop()
  Write-Host ("  Lauf {0}: {1,5:N1} s  exit={2}  {3}" -f $i, $sw.Elapsed.TotalSeconds, $code, (($o | Select-Object -Last 1) -replace '\s+', ' '))
}

Write-Host ""
Write-Host "=== 2. tsgo --noEmit ueber $($tsconfigs.Count) eigene Pakete (dreimal) ==="
for ($i = 1; $i -le 3; $i++) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $rot = 0
  foreach ($p in $tsconfigs) {
    $o = & $BUN x tsgo --noEmit -p "$p/tsconfig.json" 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      $rot++
      Write-Host ("    ROT: {0}  exit={1}  meldungen={2}" -f $p, $code, ($o | Measure-Object).Count)
      $o | Select-Object -First 3 | ForEach-Object { Write-Host ("        [" + $_ + "]") }
    }
  }
  $sw.Stop()
  Write-Host ("  Lauf {0}: {1,5:N1} s  ({2} Pakete, {3} rot)" -f $i, $sw.Elapsed.TotalSeconds, $tsconfigs.Count, $rot)
}

Write-Host ""
Write-Host "=== 3. Start OHNE Build-Schritt: bis zum Token (dreimal) ==="
for ($i = 1; $i -le 3; $i++) {
  $port = 5520 + $i
  $log = Join-Path $env:TEMP "pmh-boot-$i.log"
  Remove-Item $log, "$log.err" -ErrorAction SilentlyContinue
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $proc = Start-Process -FilePath $BUN `
    -ArgumentList @('apps/cli/src/main.ts', 'web', '--port', "$port", '--no-open',
                    '--home', (Join-Path $repo '.pmh-build\harness-home')) `
    -WorkingDirectory $repo -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -NoNewWindow
  $token = $false
  for ($s = 0; $s -lt 80; $s++) {
    Start-Sleep -Milliseconds 250
    if ($proc.HasExited) { break }
    $text = ''
    foreach ($f in @($log, "$log.err")) { if (Test-Path $f) { $text += (Get-Content $f -Raw -ErrorAction SilentlyContinue) } }
    if ($text -match 'token=') { $token = $true; break }
  }
  $sw.Stop()
  Write-Host ("  Lauf {0}: {1,5:N1} s bis zum Token  (Token: {2}, beendet: {3})" -f $i, $sw.Elapsed.TotalSeconds, $token, $proc.HasExited)
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Get-Process bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-2) } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "=== Ergebnis ==="
Write-Host "  Der Host fuehrt TypeScript DIREKT aus (Bun) - es gibt keinen Build-Schritt."
Write-Host "  tsgo prueft nur und schreibt nichts (--noEmit)."

Pop-Location
