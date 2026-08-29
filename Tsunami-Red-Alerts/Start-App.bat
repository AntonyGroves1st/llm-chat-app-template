@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org/ then run this again.
  exit /b 1
)
echo Starting Tsunami Red Alerts at http://127.0.0.1:8787
start "" http://127.0.0.1:8787
node server\index.mjs
endlocal
