@echo off
title Update now
echo Sending the latest data to the phone app. Please wait...
echo.
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1"
echo.
echo Result - last line of sync.log:
"%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-Content -LiteralPath '%~dp0sync.log' -Tail 1"
echo.
echo If it says Upload complete, the phone app is up to date.
pause
