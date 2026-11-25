@echo off
title Load an older year
echo This loads an OLD financial year (for example Data2526.Mdb) into the app, so Trends and reports show it.
echo Do this once per old year. The current year loads by itself.
echo.
set /p F=Drag the old Data....Mdb file here and press Enter: 
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0history.ps1" -Mdb "%F:"=%"
echo.
pause
