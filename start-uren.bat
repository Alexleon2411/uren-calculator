@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 24 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
)

if not exist dist (
  echo Building the interface...
  call npm run build
  if errorlevel 1 goto :error
)

echo.
echo Starting Uren on http://localhost:3000
echo Close the "Uren server" window to stop it.
echo.

start "Uren server" cmd /k "npm start"
timeout /t 3 /nobreak >nul
start "" http://localhost:3000
exit /b 0

:error
echo.
echo Something went wrong. Check the messages above.
pause
exit /b 1
