@echo off
cd /d "%~dp0"
title Credifuturo Launcher - Reparacion Automatica
echo ==========================================
echo      INICIANDO SISTEMA CREDIFUTURO
echo ==========================================
echo.
echo Diagnostico en curso... > launcher_log.txt
echo Directorio actual: %cd% >> launcher_log.txt

rem --- Verificar Node.js ---
echo Verificando Node.js...
node -v >> launcher_log.txt 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no encontrado. >> launcher_log.txt
    cls
    color 4F
    echo [ERROR CRITICO] Node.js no instalado.
    echo Instale Node.js LTS desde https://nodejs.org/
    pause
    exit
)
echo Node.js OK. >> launcher_log.txt

rem --- Servidor ---
echo.
echo [1/2] Verificando SERVIDOR...
if not exist "server\node_modules\express" (
    echo    - Dependencias incompletas. Instalando...
    echo Instalando servidor... >> launcher_log.txt
    cd server
    call npm install >> ..\launcher_log.txt 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Fallo npm install en server. >> ..\launcher_log.txt
        echo Error al instalar dependencias del servidor.
        echo Revise launcher_log.txt
        pause
    )
    cd ..
) else (
    echo    - Dependencias OK.
)

rem --- Cliente ---
echo.
echo [2/2] Verificando CLIENTE...
if not exist "client\node_modules\vite" (
    echo    - Dependencias incompletas. Instalando...
    echo Instalando cliente... >> launcher_log.txt
    cd client
    call npm install >> ..\launcher_log.txt 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Fallo npm install en client. >> ..\launcher_log.txt
        echo Error al instalar dependencias del cliente.
    )
    cd ..
) else (
    echo    - Dependencias OK.
)

echo.
echo ==========================================
echo      LANZANDO APLICACION...
echo ==========================================
echo.

start "Credifuturo Backend" cmd /k "cd /d "%~dp0server" & echo Iniciando Servidor... & npm start"
timeout /t 5 >nul
start "Credifuturo Frontend" cmd /k "cd /d "%~dp0client" & echo Iniciando Cliente... & npm run dev"

echo Aplicacion iniciada.
echo Si ves errores rojos en las otras ventanas, avisanos.
echo.
pause
