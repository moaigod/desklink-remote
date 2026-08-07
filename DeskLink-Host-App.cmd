@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "NODE_EXE="

if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
) else if exist "%LocalAppData%\Programs\nodejs\node.exe" (
  set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
) else (
  where node >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    for /f "delims=" %%I in ('where node') do set "NODE_EXE=%%I"
  )
)

if not defined NODE_EXE (
  echo Node.js was not found. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist "%SCRIPT_DIR%node_modules\electron\cli.js" (
  echo Electron was not installed yet. Run npm install in the project folder first.
  pause
  exit /b 1
)

cd /d "%SCRIPT_DIR%"
start "DeskLink Host App" "%NODE_EXE%" "%SCRIPT_DIR%node_modules\electron\cli.js" "%SCRIPT_DIR%electron-host\main.js"
