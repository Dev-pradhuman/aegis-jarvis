@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node.js/npm was not found. Install Node.js and reopen this terminal.
  exit /b 1
)

if not exist "%~dp0node_modules\.bin\electron.cmd" (
  echo Electron is not installed. Run npm.cmd install first.
  exit /b 1
)

if /i "%~1"=="--check" (
  echo Desktop: Electron with Vite renderer at http://127.0.0.1:5173
  exit /b 0
)

netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul
if errorlevel 1 start "JARVIS Backend" /min cmd.exe /d /c "npm.cmd run dev:server"

netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 start "JARVIS Frontend" /min cmd.exe /d /c "npm.cmd run dev"

powershell.exe -NoProfile -Command "$ready=$false; for($i=0;$i -lt 40;$i++){ try { $api=Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 1; $ui=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173' -TimeoutSec 1; if($api.ok -and $ui.StatusCode -eq 200){$ready=$true;break} } catch {}; Start-Sleep -Milliseconds 250 }; if($ready){exit 0}else{exit 1}"
if errorlevel 1 (
  echo JARVIS development services did not become ready. Check the backend and frontend windows.
  exit /b 1
)

start "JARVIS Desktop" /min cmd.exe /d /c "set JARVIS_RENDERER_URL=http://127.0.0.1:5173&& npm.cmd run desktop"
endlocal
