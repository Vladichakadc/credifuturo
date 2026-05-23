@echo off
chcp 65001 >nul
title Credifuturo - Sincronizar BD (modo automatico)
cd /d "%~dp0"
setlocal EnableDelayedExpansion

echo ==========================================================
echo   SINCRONIZAR BD - MODO AUTOMATICO (con Railway CLI)
echo ==========================================================
echo.
echo Este script:
echo   1. Activa SETUP_KEY temporal en Railway
echo   2. Espera el redeploy
echo   3. Descarga la BD de produccion
echo   4. Reemplaza tu BD local ^(con backup automatico^)
echo   5. Desactiva SETUP_KEY
echo.
echo Tiempo estimado: 3-5 minutos ^(la espera del redeploy es lo mas lento^).
echo.
echo ----------------------------------------------------------

REM --- Verificar Railway CLI instalado ---
where railway >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Railway CLI no esta instalado.
    echo.
    echo Para instalarlo, abre PowerShell o CMD y ejecuta:
    echo   npm install -g @railway/cli
    echo.
    echo Luego autenticate:
    echo   railway login
    echo.
    echo Y vincula este proyecto ^(desde esta carpeta^):
    echo   railway link
    echo.
    pause
    exit /b 1
)

REM --- Verificar autenticacion ---
railway whoami >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] No has iniciado sesion en Railway CLI.
    echo Ejecuta: railway login
    echo.
    pause
    exit /b 1
)

REM --- Verificar proyecto vinculado ---
railway status >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] No hay proyecto vinculado en esta carpeta.
    echo Ejecuta desde aqui: railway link
    echo Y selecciona "credifuturo".
    echo.
    pause
    exit /b 1
)

REM --- Generar SETUP_KEY temporal aleatoria ---
set "TEMP_KEY=sync_%RANDOM%%RANDOM%_%time:~6,2%%time:~3,2%"

echo.
echo [1/5] Activando SETUP_KEY temporal en Railway...
railway variable set "SETUP_KEY=%TEMP_KEY%" >nul 2>&1
if errorlevel 1 (
    echo       [ERROR] No se pudo establecer SETUP_KEY.
    echo       Ejecuta manualmente: railway variables --set "SETUP_KEY=valor"
    pause
    exit /b 1
)
echo       OK - SETUP_KEY activado.
echo.

REM --- Esperar redeploy: polling al endpoint ---
echo [2/5] Esperando redeploy de Railway...
echo       ^(Railway tarda ~2-3 min en redeployar despues de cambiar variables^)
echo.
set /a ATTEMPTS=0
:wait_loop
set /a ATTEMPTS+=1
if !ATTEMPTS! GTR 24 (
    echo.
    echo       [ERROR] Tiempo de espera excedido ^(6 min^).
    echo       El redeploy de Railway no termino. Removiendo SETUP_KEY...
    railway variable delete SETUP_KEY >nul 2>&1
    pause
    exit /b 1
)
timeout /t 15 /nobreak >nul
for /f %%i in ('curl.exe -s -o nul -w "%%{http_code}" -H "X-Setup-Key: %TEMP_KEY%" https://credifuturo-production.up.railway.app/api/setup/download-db 2^>nul') do set CODE=%%i
if "!CODE!"=="200" goto endpoint_ready
echo       Intento !ATTEMPTS!/24 - HTTP !CODE!, esperando 15s mas...
goto wait_loop

:endpoint_ready
echo       OK - Endpoint listo despues de !ATTEMPTS! intento^(s^).
echo.

REM --- Backup BD local ---
if exist "database.sqlite" (
    echo [3/5] Creando backup de BD local...
    set "BACKUP_NAME=database.sqlite.bak.%date:~-4%-%date:~3,2%-%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
    set "BACKUP_NAME=!BACKUP_NAME: =0!"
    copy /Y "database.sqlite" "!BACKUP_NAME!" >nul
    echo       OK - Backup: !BACKUP_NAME!
    echo.
) else (
    echo [3/5] No hay BD local previa, se omite backup.
    echo.
)

REM --- Descargar BD ---
echo [4/5] Descargando BD de produccion...
curl.exe -s -f -H "X-Setup-Key: %TEMP_KEY%" -o "database.sqlite.tmp" https://credifuturo-production.up.railway.app/api/setup/download-db
if errorlevel 1 (
    echo       [ERROR] Descarga fallo.
    if exist "database.sqlite.tmp" del "database.sqlite.tmp"
    railway variable delete SETUP_KEY >nul 2>&1
    pause
    exit /b 1
)
for %%A in ("database.sqlite.tmp") do set SIZE=%%~zA
if !SIZE! LSS 100000 (
    echo       [ERROR] Archivo muy pequeno ^(!SIZE! bytes^), probablemente error.
    type "database.sqlite.tmp"
    del "database.sqlite.tmp"
    railway variable delete SETUP_KEY >nul 2>&1
    pause
    exit /b 1
)
move /Y "database.sqlite.tmp" "database.sqlite" >nul
echo       OK - BD descargada ^(!SIZE! bytes^).
echo.

REM --- Desactivar SETUP_KEY ---
echo [5/5] Desactivando SETUP_KEY en Railway...
railway variable delete SETUP_KEY >nul 2>&1
if errorlevel 1 (
    echo       [ADVERTENCIA] No se pudo remover SETUP_KEY automaticamente.
    echo       Eliminala manualmente desde Railway dashboard:
    echo       https://railway.app
) else (
    echo       OK - SETUP_KEY removido.
)
echo.

echo ==========================================================
echo   SINCRONIZACION COMPLETADA
echo ==========================================================
echo.
echo IMPORTANTE: Si tu servidor local esta corriendo, reinicialo
echo   ^(Ctrl+C en la terminal del server y luego: npm start^)
echo   para que cargue la nueva BD.
echo.
pause
