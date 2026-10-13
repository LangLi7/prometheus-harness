@echo off
rem ============================================================================
rem  Prometheus Harness - Installation fuer Windows
rem ============================================================================
rem
rem  ## Warum es diese Datei gibt - und warum sie zuerst kommt
rem
rem  Auf dem Zielrechner steht `CurrentUser = Restricted`. Ein `.ps1`-Skript
rem  **laedt dann nicht**:
rem
rem      & : Die Datei ...\install.ps1 kann nicht geladen werden, weil das
rem      Ausfuehren von Skripten auf diesem System deaktiviert ist.
rem
rem  Eine `.cmd`-Datei ist davon **nicht** betroffen: die Ausfuehrungsrichtlinie
rem  gilt fuer PowerShell-Skripte, nicht fuer `cmd.exe`. Damit ist dies der
rem  **einzige Einstieg, der ohne Vorbedingung startet** - und deshalb der
rem  Einstieg, den ein Fremder zuerst findet.
rem
rem  ## Was diese Datei tut und was nicht
rem
rem  Sie ist eine **Huelle**: sie findet PowerShell, ruft `install.ps1` mit
rem  `-ExecutionPolicy Bypass` (nur fuer **diesen** Aufruf, keine dauerhafte
rem  Aenderung am System) und reicht den Exit-Code durch.
rem
rem  Die Logik steht in `scripts/install.mjs` - einmal, fuer beide Plattformen.
rem  Eine zweite Fassung in Batch waere eine zweite Wahrheit, die auseinandergeht.
rem
rem  Aufruf:
rem      scripts\install.cmd
rem      scripts\install.cmd --ohne-stapel
rem ============================================================================

setlocal

rem In das Projektverzeichnis wechseln - unabhaengig vom Aufrufort.
cd /d "%~dp0.."

echo Prometheus Harness - Installation
echo Projekt: %CD%
echo.

rem --- PowerShell finden -------------------------------------------------------
rem  `pwsh` (7+) wird bevorzugt, `powershell` (5.1) ist der Rueckfall. Beide
rem  koennen, was hier gebraucht wird; 7 ist schneller und hat eine
rem  vollstaendigere UTF-8-Behandlung.
set "PS="
where pwsh >nul 2>&1 && set "PS=pwsh"
if not defined PS (
  where powershell >nul 2>&1 && set "PS=powershell"
)
if not defined PS (
  echo FEHLER: weder pwsh noch powershell gefunden.
  echo PowerShell gehoert zu Windows; fehlt es, ist das System beschnitten.
  exit /b 1
)

rem --- Argumente sammeln und uebersetzen --------------------------------------
rem  **Die Uebersetzung ist noetig, nicht kosmetisch.** Ein Aufruf
rem  `install.cmd --ohne-stapel` reicht `--ohne-stapel` weiter; PowerShell kennt
rem  aber nur den Parameter `-OhneStapel` und bricht ab mit
rem  "Es wurde kein Parameter gefunden, der dem Parameternamen ... entspricht".
rem  Gemessen am 13.10.2026 - das war der erste Aufruf der Huelle.
rem
rem  Deshalb werden hier die Argumente in die PowerShell-Schreibweise gebracht,
rem  damit **beide** Formen funktionieren: die aus der Anleitung (`--ohne-stapel`,
rem  wie bei bun und docker) und die von PowerShell (`-OhneStapel`).
set "ARGS="
:schleife
if "%~1"=="" goto fertig
set "A=%~1"
if /i "%A%"=="--ohne-stapel" set "A=-OhneStapel"
if /i "%A%"=="--help" set "A=-?"
if /i "%A%"=="-h" set "A=-?"
set "ARGS=%ARGS% %A%"
shift
goto schleife
:fertig

rem --- Uebergeben --------------------------------------------------------------
rem  `-ExecutionPolicy Bypass` gilt **nur fuer diesen Aufruf**. Die dauerhafte
rem  Richtlinie des Rechners wird nicht angefasst - das waere eine Aenderung an
rem  der Sicherheitseinstellung eines fremden Systems.
%PS% -NoProfile -ExecutionPolicy Bypass -File "scripts\install.ps1" %ARGS%
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
  echo.
  echo Installation mit Fehlercode %CODE% beendet.
)

endlocal & exit /b %CODE%
