<#
.SYNOPSIS
    Prometheus Harness — Installation für Windows.

.DESCRIPTION
    **Was diese Datei ist und was nicht.** Sie ist eine **Hülle**: sie stellt
    sicher, daß Bun vorhanden ist, und übergibt dann an `scripts/install.mjs`.
    Die eigentliche Installation steht **dort** — einmal, für beide Plattformen.

    **Warum die Logik nicht hier steht.** Gemessen auf dem Zielrechner am
    13.10.2026: `sh` fehlt, `bash` gibt es nur aus WSL (und dessen `bash` sieht
    `C:\…` nicht), `unzip` fehlt. Ein Installer, dessen Logik in der Shell
    liegt, hätte dort **keinen Interpreter**. Bun dagegen ist die eine
    Voraussetzung, die dieses Projekt ohnehin hat.

    ## Die Ausführungsrichtlinie — der Stolperstein

    Auf dem Zielrechner steht `CurrentUser = Restricted`. Ein `.ps1`-Skript
    **lädt dann nicht**:

        & : Die Datei …\install.ps1 kann nicht geladen werden, weil das
        Ausführen von Skripten auf diesem System deaktiviert ist.

    Das ist die Voreinstellung vieler Windows-Rechner. Zwei Auswege, beide
    dokumentiert und beide **ohne** dauerhafte Änderung am System:

        # einmalig, nur für diesen Aufruf:
        powershell -ExecutionPolicy Bypass -File scripts\install.ps1

        # oder: den Inhalt als Befehl übergeben (lädt keine Datei):
        Get-Content scripts\install.ps1 -Raw | Invoke-Expression

    Dieses Skript ändert die Richtlinie **nicht** von selbst: das wäre eine
    Änderung an der Sicherheitseinstellung eines fremden Rechners.

.PARAMETER OhneStapel
    Datenbank und Redis nicht starten und keine Migrationen ausführen.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1

.EXAMPLE
    pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/install.ps1 -OhneStapel
#>
[CmdletBinding()]
param(
  [switch]$OhneStapel
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# 0. Wo liegt das Projekt? — und was tun, wenn es hier nicht liegt
# ---------------------------------------------------------------------------
# **Drei Wege, dieses Skript zu starten, und der dritte ist der Ein-Zeiler:**
#
#   powershell -File scripts\install.ps1      → $PSCommandPath ist gesetzt
#   Get-Content … | Invoke-Expression        → $PSCommandPath ist LEER
#   irm …/install.ps1 | iex                  → $PSCommandPath ist LEER
#
# Bis zum 31.10.2026 las dieses Skript **nur** `$PSCommandPath`. Bei den beiden
# `iex`-Wegen ist die Variable leer; `Split-Path -Parent ''` liefert dann `''`,
# `Join-Path '' '..'` liefert `..`, und der `Push-Location` landete im
# **Elternverzeichnis des Aufruforts**. Das Skript hätte dort „installiert", wo
# nichts zu installieren ist — und der empfohlene Ausweg für die
# Ausführungsrichtlinie (siehe oben) wäre genau der kaputte Weg gewesen.
function Test-Projekt([string]$pfad) {
  return (Test-Path -LiteralPath (Join-Path $pfad 'scripts/install.mjs')) -and
         (Test-Path -LiteralPath (Join-Path $pfad 'package.json'))
}

$kandidat = $null
if ($PSCommandPath) {
  # <projekt>\scripts\install.ps1 → zweimal Parent ist das Projekt.
  $kandidat = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
} elseif ($PSScriptRoot) {
  $kandidat = Split-Path -Parent $PSScriptRoot
} else {
  $kandidat = (Get-Location).Path
}
if (-not (Test-Projekt $kandidat)) { $kandidat = (Get-Location).Path }

# **Der Ein-Zeiler holt das Projekt selbst.** Derselbe Weg wie in `install.sh`:
# erst prüfen, dann holen, dann dort weitermachen. Übersteuerbar, damit der Weg
# ohne Netz prüfbar ist:
#   $env:PMH_REPO          Quelle des Projekts
#   $env:PMH_VERZEICHNIS   Zielordner im aktuellen Verzeichnis
if (-not (Test-Projekt $kandidat)) {
  $repo = if ($env:PMH_REPO) { $env:PMH_REPO } else { 'https://github.com/LangLi7/prometheus-harness.git' }
  $zielName = if ($env:PMH_VERZEICHNIS) { $env:PMH_VERZEICHNIS } else { 'prometheus-harness' }

  Write-Host 'Hier liegt kein Prometheus-Harness-Projekt — es wird geholt.'
  Write-Host "  Quelle: $repo"
  Write-Host "  Ziel:   $((Get-Location).Path)\$zielName"
  Write-Host ''

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host 'FEHLER: git fehlt, und ohne git kann das Projekt nicht geholt werden.'
    Write-Host '  winget install --id Git.Git'
    exit 1
  }
  if (Test-Path -LiteralPath $zielName) {
    Write-Host "FEHLER: '$zielName' gibt es hier schon — ich überschreibe nichts."
    Write-Host "  Entweder dort hineingehen und 'scripts\install.cmd' aufrufen,"
    Write-Host "  oder `$env:PMH_VERZEICHNIS auf einen anderen Namen setzen."
    exit 1
  }

  & git clone --depth 1 $repo $zielName
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'FEHLER: das Klonen ist gescheitert. Ist die Adresse erreichbar und das'
    Write-Host "  Repository für dich lesbar? Adresse: $repo"
    exit 1
  }
  $kandidat = (Resolve-Path -LiteralPath $zielName).Path
  Write-Host ''
  Write-Host "Geholt nach $kandidat — die Installation läuft dort weiter."
  Write-Host ''
}

$projekt = (Resolve-Path -LiteralPath $kandidat).Path
Push-Location $projekt
try {
  Write-Host 'Prometheus Harness — Installation'
  Write-Host "Projekt: $projekt"
  Write-Host ''

  # --- 1. Bun sicherstellen --------------------------------------------------
  # **Der übliche Ort, falls der PATH noch nicht stimmt.** Das
  # Installationsskript von Bun legt `bun.exe` nach `%USERPROFILE%\.bun\bin` und
  # trägt es in die Benutzerumgebung ein — eine **laufende** Shell sieht das
  # nicht.
  function Get-BunBefehl {
    # **Warum nicht einfach `bun`.** Gemessen auf dem Zielrechner: es liegen
    # DREI `bun`-Einträge im PATH, und zwei sind defekt —
    # `%APPDATA%\npm\bun.cmd` ruft ein fremdarchigtes `bun.exe` auf, und
    # `%APPDATA%\npm\bun.ps1` wird von der Ausführungsrichtlinie blockiert. Die
    # funktionierende Fassung liegt unter `%USERPROFILE%\.bun\bin\bun.exe`.
    $eigene = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
    if (Test-Path $eigene) { return $eigene }
    $imPath = Get-Command bun -ErrorAction SilentlyContinue
    if ($imPath) { return $imPath.Source }
    return $null
  }

  $bun = Get-BunBefehl
  if (-not $bun) {
    Write-Host 'Bun ist nicht installiert — wird jetzt installiert.'
    Write-Host '  irm bun.sh/install.ps1 | iex'
    Write-Host ''
    # Der offizielle Weg des Bun-Projekts für Windows.
    Invoke-RestMethod bun.sh/install.ps1 | Invoke-Expression
    $bun = Get-BunBefehl
    if (-not $bun) {
      Write-Host ''
      Write-Host 'FEHLER: Bun ist auch nach der Installation nicht auffindbar.'
      Write-Host 'Starte eine NEUE PowerShell und rufe dieses Skript erneut auf.'
      exit 1
    }
    Write-Host ''
    Write-Host "Bun wurde installiert: $(& $bun --version)"
  }

  Write-Host "Bun: $(& $bun --version)"

  # --- 2. Übergeben an das eigentliche Installationsskript -------------------
  $argumente = @('scripts/install.mjs')
  if ($OhneStapel) { $argumente += '--ohne-stapel' }

  # **Der Exit-Code wird durchgereicht.** Ohne diese Zeile endet PowerShell mit 0,
  # auch wenn die Installation gescheitert ist — und ein Aufrufer aus einem
  # anderen Skript merkte es nicht.
  & $bun @argumente
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
