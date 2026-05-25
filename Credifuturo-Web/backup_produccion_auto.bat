@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal EnableDelayedExpansion

REM ===========================================================
REM  backup_produccion_auto.bat
REM  Backup SILENCIOSO de la BD de produccion (Railway)
REM  + Genera los 6 archivos Excel de reporte
REM  Ejecutado por el Programador de Tareas de Windows.
REM  NO tiene "pause" — corre sin interaccion humana.
REM  Log: c:\Credifuturo\Backups\backup_log.txt
REM ===========================================================

REM --- Rutas ---
set "BACKUP_ROOT=c:\Credifuturo\Backups"
set "LOG_FILE=%BACKUP_ROOT%\backup_log.txt"
set "WEBDIR=c:\Credifuturo\Credifuturo-Web"

REM --- Timestamp para nombre de carpeta y log ---
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd_HHmmss'"`) do set "TS=%%i"
set "BACKUP_DIR=%BACKUP_ROOT%\%TS%"

REM --- Asegurarse de que exista la carpeta de backups ---
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"

REM --- Funcion de log ---
call :log "=============================================="
call :log "INICIO BACKUP PRODUCCION - %TS%"
call :log "=============================================="

REM --- Verificar Railway CLI ---
where railway >nul 2>&1
if errorlevel 1 (
    call :log "[ERROR] Railway CLI no instalado. Instala con: npm install -g @railway/cli"
    exit /b 1
)

REM --- Verificar autenticacion Railway ---
railway whoami >nul 2>&1
if errorlevel 1 (
    call :log "[ERROR] No autenticado en Railway. Ejecuta: railway login"
    exit /b 1
)

REM --- Verificar proyecto vinculado ---
railway status >nul 2>&1
if errorlevel 1 (
    call :log "[ERROR] No hay proyecto Railway vinculado en: %WEBDIR%"
    call :log "        Ejecuta: railway link  (dentro de Credifuturo-Web)"
    exit /b 1
)

REM --- Generar SETUP_KEY temporal (>=32 chars) ---
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$b=New-Object Byte[] 30;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);[Convert]::ToBase64String($b).TrimEnd('=')"`) do set "TEMP_KEY=%%i"
call :log "[1/5] SETUP_KEY temporal generada."

REM --- Activar variables en Railway ---
railway variables --set "SETUP_KEY=%TEMP_KEY%" >nul 2>&1
if errorlevel 1 (
    call :log "[ERROR] No se pudo establecer SETUP_KEY en Railway."
    exit /b 1
)
railway variables --set "ALLOW_SETUP_IN_PRODUCTION=true" >nul 2>&1
if errorlevel 1 (
    call :log "[ERROR] No se pudo establecer ALLOW_SETUP_IN_PRODUCTION."
    railway variables --remove SETUP_KEY >nul 2>&1
    exit /b 1
)
call :log "[2/5] Variables Railway activadas. Esperando redeploy..."

REM --- Polling al endpoint (max 24 intentos x 15s = 6 min) ---
set /a ATTEMPTS=0
:wait_loop
set /a ATTEMPTS+=1
if !ATTEMPTS! GTR 24 (
    call :log "[ERROR] Tiempo de espera excedido (6 min). Redeploy no termino."
    railway variables --remove SETUP_KEY >nul 2>&1
    railway variables --remove ALLOW_SETUP_IN_PRODUCTION >nul 2>&1
    exit /b 1
)
timeout /t 15 /nobreak >nul
for /f %%i in ('curl.exe -s -o nul -w "%%{http_code}" -H "X-Setup-Key: %TEMP_KEY%" https://credifuturo.up.railway.app/api/setup/download-db 2^>nul') do set CODE=%%i
if "!CODE!"=="200" goto endpoint_ready
call :log "        Intento !ATTEMPTS!/24 - HTTP !CODE!, esperando..."
goto wait_loop

:endpoint_ready
call :log "[3/5] Endpoint listo tras !ATTEMPTS! intento(s)."

REM --- Crear carpeta de backup con timestamp ---
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM --- Descargar BD de produccion ---
call :log "[4/5] Descargando database.sqlite desde Railway..."
curl.exe -s -f -H "X-Setup-Key: %TEMP_KEY%" -o "%BACKUP_DIR%\database.sqlite.tmp" https://credifuturo.up.railway.app/api/setup/download-db
if errorlevel 1 (
    call :log "[ERROR] Descarga fallida."
    if exist "%BACKUP_DIR%\database.sqlite.tmp" del "%BACKUP_DIR%\database.sqlite.tmp"
    railway variables --remove SETUP_KEY >nul 2>&1
    railway variables --remove ALLOW_SETUP_IN_PRODUCTION >nul 2>&1
    exit /b 1
)

REM --- Validar tamano minimo (100 KB) ---
for %%A in ("%BACKUP_DIR%\database.sqlite.tmp") do set SIZE=%%~zA
if !SIZE! LSS 100000 (
    call :log "[ERROR] Archivo muy pequeno (!SIZE! bytes). Probable error de descarga."
    del "%BACKUP_DIR%\database.sqlite.tmp"
    railway variables --remove SETUP_KEY >nul 2>&1
    railway variables --remove ALLOW_SETUP_IN_PRODUCTION >nul 2>&1
    exit /b 1
)

REM --- Renombrar al nombre definitivo ---
move /Y "%BACKUP_DIR%\database.sqlite.tmp" "%BACKUP_DIR%\database.sqlite" >nul
call :log "        OK - BD guardada: %BACKUP_DIR%\database.sqlite (!SIZE! bytes)"

REM --- Generar Excel desde la BD descargada ---
call :log "[5/6] Generando archivos Excel desde la BD de produccion..."
where node >nul 2>&1
if errorlevel 1 (
    call :log "[ADVERTENCIA] Node.js no encontrado. Se omite generacion de Excel."
) else (
    node "%WEBDIR%\generar_excel_backup.js" "%BACKUP_DIR%" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        call :log "[ADVERTENCIA] Error al generar Excel. La BD si quedo guardada."
    ) else (
        call :log "        OK - 6 archivos Excel generados en: %BACKUP_DIR%"
    )
)

REM --- Desactivar variables Railway ---
call :log "[6/6] Desactivando variables temporales en Railway..."
set /a REMOVE_ERRORS=0
railway variables --remove SETUP_KEY >nul 2>&1
if errorlevel 1 set /a REMOVE_ERRORS+=1
railway variables --remove ALLOW_SETUP_IN_PRODUCTION >nul 2>&1
if errorlevel 1 set /a REMOVE_ERRORS+=1
if !REMOVE_ERRORS! EQU 0 (
    call :log "        OK - Variables removidas."
) else (
    call :log "[ADVERTENCIA] No se pudieron remover !REMOVE_ERRORS! variable(s). Verificar en Railway dashboard."
)

REM --- Limpiar backups antiguos (conservar ultimos 30) ---
call :log "[LIMPIEZA] Verificando backups antiguos..."
for /f "skip=30 delims=" %%D in ('dir "%BACKUP_ROOT%" /ad /b /o-d 2^>nul ^| findstr /r "^[0-9]"') do (
    call :log "        Eliminando backup antiguo: %%D"
    rd /s /q "%BACKUP_ROOT%\%%D" >nul 2>&1
)

call :log "=============================================="
call :log "BACKUP COMPLETADO EXITOSAMENTE"
call :log "  Ubicacion: %BACKUP_DIR%"
call :log "  Archivos:  database.sqlite + 6 Excel"
call :log "  Tamano BD: !SIZE! bytes"
call :log "=============================================="
exit /b 0

REM --- Subrutina de log (escribe en archivo Y en consola) ---
:log
set "MSG=%~1"
echo [%date% %time:~0,8%] %MSG%
echo [%date% %time:~0,8%] %MSG%>> "%LOG_FILE%"
exit /b 0
