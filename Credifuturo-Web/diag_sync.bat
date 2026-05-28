@echo off
chcp 65001 >nul
title Diagnostico sincronizacion
cd /d "%~dp0"
setlocal EnableDelayedExpansion

echo ==========================================================
echo   DIAGNOSTICO - chequeos previos sin tocar Railway prod
echo ==========================================================
echo.

echo [1] Verificando Railway CLI (where railway)...
where railway
echo errorlevel=%errorlevel%
echo.
pause

echo [2] Verificando autenticacion (railway whoami)...
railway whoami
echo errorlevel=%errorlevel%
echo.
pause

echo [3] Verificando proyecto vinculado (railway status)...
railway status
echo errorlevel=%errorlevel%
echo.
pause

echo [4] Generando TEMP_KEY con PowerShell...
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$b=New-Object Byte[] 30;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);[Convert]::ToBase64String($b).TrimEnd('=')"`) do set "TEMP_KEY=%%i"
echo TEMP_KEY length:
echo|set /p=%TEMP_KEY%| find /c /v ""
echo TEMP_KEY value: %TEMP_KEY%
echo.
pause

echo [5] Probando curl al endpoint actual (esperado: 403 o 404 porque setup no activo)...
curl.exe -s -o nul -w "HTTP %%{http_code}\n" https://credifuturo.up.railway.app/api/setup/download-db
echo.
echo Si todo lo anterior salio bien, el script real deberia funcionar.
echo.
pause
