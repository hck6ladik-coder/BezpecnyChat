@echo off
chcp 65001 > nul
title Bezpecny Chat - KECCAK256 E2EE

echo ========================================================
echo    Bezpecny Chat (KECCAK-256 E2EE) - Samostatny Beh
echo    Plne decentralizovana P2P komunikace bez serveru
echo ========================================================
echo.

set "DIST_INDEX=%~dp0dist\index.html"

if exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo [OK] Spoustim jako samostatnou desktopovou aplikaci...
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0electron\main.cjs"
    exit /b 0
)

if exist "%DIST_INDEX%" (
    echo [OK] Oteviram aplikaci primo v prohlizeci bez lokalniho serveru...
    start "" "%DIST_INDEX%"
    exit /b 0
)

echo Sestavuji aplikaci (jednorazovy proces)...
call npm run build
if exist "%DIST_INDEX%" (
    start "" "%DIST_INDEX%"
) else (
    echo Chyba pri spousteni.
    pause
)
