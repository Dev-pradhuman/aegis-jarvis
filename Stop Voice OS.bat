@echo off
setlocal
set "PIDFILE=%~dp0server\data\voice-os-bridge.pid"
if not exist "%PIDFILE%" (
  echo JARVIS Voice OS bridge is not running.
  exit /b 0
)
set /p BRIDGEPID=<"%PIDFILE%"
taskkill /PID %BRIDGEPID% /F >nul 2>&1
del /q "%PIDFILE%" >nul 2>&1
echo JARVIS Voice OS bridge stopped.
endlocal
