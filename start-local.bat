@echo off
rem Rings local run: account server + app (see server/start-local.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\start-local.ps1"
pause
