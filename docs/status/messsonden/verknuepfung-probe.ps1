# verknuepfung-probe.ps1 - darf dieser Wirt symbolische Verknuepfungen?
#
# > **Was sie beantwortet.** Ob ein **Symlink** (`mklink /D`) und ein **Junction**
# > (`mklink /J`) auf diesem Rechner angelegt werden duerfen - und was der Unterschied
# > fuer den Launcher ist. Anlass war die Messung, dass `dsh --profile <name> --dump-config`
# > hier mit `EPERM ... symlink ... -> $DSH_HOME\profiles\node_modules\@deepseek-ai\dsh`
# > abbricht (`docs/design/harness-generationen.md` Paragraph 1.4).
#
# > **Was sie NICHT tut.** Sie fasst das Projekt nicht an: Quelle und Ziel liegen in einem
# > eigenen Wegwerfordner unter `$env:TEMP`, der am Ende wieder entfernt wird. Sie liest
# > keine Konfiguration, sie startet keinen Host, sie aendert keine Datei des Repos.
#
# Aufruf:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File docs/status/messsonden/verknuepfung-probe.ps1
#
# Exit-Codes:
#   0  Symlink UND Junction gingen         (beide Wege offen)
#   1  nur Junction geht                   (der Weg, den der Entwurf vorsieht)
#   2  keines von beiden geht              (dann braucht der Zeiger eine dritte Form)
#   3  Aufruffehler / Aufraeumen fehlgeschlagen

$ErrorActionPreference = 'Stop'

$wurzel = Join-Path $env:TEMP ("pmh-verknuepfung-probe-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$ziel   = Join-Path $wurzel 'ziel'
$sym    = Join-Path $wurzel 'symlink'
$junc   = Join-Path $wurzel 'junction'
$marke  = Join-Path $ziel 'inhalt.txt'

function Sag([string]$text) { Write-Output $text }

try {
    New-Item -ItemType Directory -Force -Path $ziel | Out-Null
    Set-Content -Path $marke -Value 'probe' -Encoding ascii

    Sag "Wegwerfordner : $wurzel"
    Sag "Windows       : $([System.Environment]::OSVersion.VersionString)"
    Sag ""

    # --- 1. symbolische Verknuepfung (braucht SeCreateSymbolicLinkPrivilege) ---
    $symOk = $false
    $symText = (& cmd /c "mklink /D `"$sym`" `"$ziel`"" 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0) {
        $symOk = Test-Path (Join-Path $sym 'inhalt.txt')
        Sag "Symlink  (mklink /D) : exit 0   Ziel lesbar=$symOk   $symText"
    } else {
        Sag "Symlink  (mklink /D) : exit $LASTEXITCODE   $symText"
    }

    # --- 2. Junction (braucht das Recht NICHT) ---
    $juncOk = $false
    $juncText = (& cmd /c "mklink /J `"$junc`" `"$ziel`"" 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0) {
        $juncOk = Test-Path (Join-Path $junc 'inhalt.txt')
        $art = (Get-Item $junc -Force).LinkType
        Sag "Junction (mklink /J) : exit 0   Ziel lesbar=$juncOk   LinkType=$art"
    } else {
        Sag "Junction (mklink /J) : exit $LASTEXITCODE   $juncText"
    }

    Sag ""
    if ($symOk -and $juncOk) {
        Sag "ERGEBNIS: beide Wege offen. Ein Zeiger duerfte auch eine Verknuepfung sein."
        exit 0
    }
    if ($juncOk) {
        Sag "ERGEBNIS: nur der Junction geht. Der Entwurf sieht deshalb eine ZEIGERDATEI vor"
        Sag "          (docs/design/harness-generationen.md Paragraph 3.4) - keine Verknuepfung."
        exit 1
    }
    Sag "ERGEBNIS: keine Verknuepfungsform verfuegbar. Der Zeiger muss eine reine Datei sein,"
    Sag "          und ein geteiltes Abhaengigkeitsverzeichnis ist auf diesem Wirt nicht moeglich."
    exit 2
}
catch {
    Write-Error "Aufruffehler: $($_.Exception.Message)"
    exit 3
}
finally {
    # Aufraeumen: erst die Verknuepfungen (rmdir loescht die Verknuepfung, nicht das Ziel),
    # dann der Baum. Ein Rest wird GEMELDET, nicht verschwiegen.
    foreach ($p in @($sym, $junc)) {
        if (Test-Path $p) { & cmd /c "rmdir `"$p`"" 2>&1 | Out-Null }
    }
    if (Test-Path $wurzel) { Remove-Item -Recurse -Force $wurzel -ErrorAction SilentlyContinue }
    if (Test-Path $wurzel) {
        Write-Output "WARNUNG: Wegwerfordner nicht entfernt: $wurzel"
        exit 3
    }
}
