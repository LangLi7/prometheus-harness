@echo off
rem PMH wrapper: run a tasteskill script from an agent shell whose sandbox denies piped stdio.
rem PowerShell captures a child's output through a named pipe, and that pipe cannot be opened under
rem workspace-write confinement, so the child writes to a file and the caller reads that file.
rem
rem   cmd /c .agents\skills\design-taste-frontend\scripts\pmh-run.cmd draw --list sectors
rem   read .taste-skill\run-draw.txt
rem
rem The script name may be bare (draw, lint, inspect, assets, scenes) or a path ending in .mjs.
rem Output file: %TASTE_SKILL_OUT%\run-<name>.txt, otherwise %CD%\.taste-skill\run-<name>.txt.
rem Nothing is written to stdout, which is what keeps the call legal inside the sandbox.

setlocal EnableExtensions
set "HERE=%~dp0"
set "SCRIPT=%~1"
if "%SCRIPT%"=="" (
  echo usage: pmh-run.cmd ^<script^> [args...] 1>&2
  exit /b 2
)
shift

if exist "%SCRIPT%" (
  set "FILE=%SCRIPT%"
) else (
  set "FILE=%HERE%%SCRIPT%.mjs"
)
if not exist "%FILE%" (
  echo pmh-run: no such script: %SCRIPT% 1>&2
  exit /b 2
)
for %%F in ("%FILE%") do set "BASE=%%~nF"

if not defined CHROME_PATH call :findchrome

set "OUTDIR=%TASTE_SKILL_OUT%"
if not defined OUTDIR set "OUTDIR=%CD%\.taste-skill"
if not exist "%OUTDIR%" mkdir "%OUTDIR%" >nul 2>&1
set "OUT=%OUTDIR%\run-%BASE%.txt"

set "ARGS="
:collect
if "%~1"=="" goto :run
set "ARGS=%ARGS% "%~1""
shift
goto :collect

:run
node "%FILE%" %ARGS% > "%OUT%" 2>&1
set "CODE=%ERRORLEVEL%"
rem Redirect first: a trailing digit before >> would be read as a file descriptor and the echo would escape.
>>"%OUT%" echo exit=%CODE%
endlocal & exit /b %CODE%

:findchrome
rem The skill knows Chrome, Edge and Brave, not Playwright's Chromium build, which is what this machine has.
for %%D in ("%LOCALAPPDATA%\ms-playwright") do (
  for /d %%V in ("%%~D\chromium-*") do (
    for %%E in ("%%~V\chrome-win64\chrome.exe" "%%~V\chrome-win\chrome.exe") do (
      if exist "%%~E" if not defined CHROME_PATH set "CHROME_PATH=%%~E"
    )
  )
)
exit /b 0
