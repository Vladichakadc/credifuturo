@echo off
chcp 65001 >nul
title Credifuturo - Sincronizar BD desde Railway
cd /d "%~dp0"

echo ==========================================================
echo   SINCRONIZAR BASE DE DATOS DESDE RAILWAY (PRODUCCION)
echo ==========================================================
echo.
echo Este script descarga la base de datos de Railway y reemplaza
echo tu base de datos LOCAL con la copia de produccion.
echo.
echo Tu BD local actual se guardara como backup antes de reemplazar.
echo.
echo PREREQUISITO en Railway:
echo   1. Variable SETUP_KEY debe estar configurada
echo   2. Servicio debe estar corriendo
echo.
echo ----------------------------------------------------------

REM --- Solicitar SETUP_KEY al usuario ---
set /p SETUP_KEY="Ingresa el SETUP_KEY de Railway: "
if "%SETUP_KEY%"=="" (
    echo.
    echo [CANCELADO] No ingresaste un SETUP_KEY.
    pause
    exit /b 1
)
echo.

REM --- Backup de la BD local actual ---
if exist "database.sqlite" (
    set BACKUP_NAME=database.sqlite.bak.%date:~-4%-%date:~3,2%-%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
    set BACKUP_NAME=%BACKUP_NAME: =0%
    echo [1/3] Creando backup de la BD local...
    copy /Y "database.sqlite" "%BACKUP_NAME%" >nul
    if errorlevel 1 (
        echo       [ERROR] No se pudo crear el backup. Abortando.
        pause
        exit /b 1
    )
    echo       OK - Backup: %BACKUP_NAME%
) else (
    echo [1/3] No hay BD local previa, se omite backup.
)
echo.

REM --- Descargar BD desde Railway ---
echo [2/3] Descargando BD desde Railway...
curl.exe -s -f -H "X-Setup-Key: %SETUP_KEY%" -o "database.sqlite.tmp" https://credifuturo-production.up.railway.app/api/setup/download-db
if errorlevel 1 (
    echo       [ERROR] La descarga fallo. Verifica que SETUP_KEY sea correcto
    echo       y que el endpoint este activo en Railway.
    if exist "database.sqlite.tmp" del "database.sqlite.tmp"
    pause
    exit /b 1
)

REM --- Validar que sea un archivo SQLite valido (no un JSON de error) ---
for %%A in ("database.sqlite.tmp") do set SIZE=%%~zA
if %SIZE% LSS 100000 (
    echo       [ERROR] Archivo descargado muy pequeno ^(%SIZE% bytes^).
    echo       Probablemente es un mensaje de error, no la BD:
    echo.
    type "database.sqlite.tmp"
    echo.
    del "database.sqlite.tmp"
    pause
    exit /b 1
)
echo       OK - Descargado: %SIZE% bytes
echo.

REM --- Reemplazar BD local ---
echo [3/3] Reemplazando BD local...
move /Y "database.sqlite.tmp" "database.sqlite" >nul
if errorlevel 1 (
    echo       [ERROR] No se pudo reemplazar la BD local.
    pause
    exit /b 1
)
echo       OK - BD local actualizada.
echo.

echo ==========================================================
echo   SINCRONIZACION COMPLETADA
echo ==========================================================
echo.
echo IMPORTANTE:
echo   - Si tu servidor local esta corriendo, REINICIALO ^(Ctrl+C y npm start^)
echo     para que cargue la nueva BD.
echo   - Por seguridad, considera ELIMINAR la variable SETUP_KEY de Railway
echo     hasta la proxima vez que necesites sincronizar.
echo.
pause
