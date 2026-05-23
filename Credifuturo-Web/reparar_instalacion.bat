@echo off
cd /d "%~dp0"
title Credifuturo - REPARADOR DE INSTALACION
color 0E

echo ==========================================
echo      REPARANDO INSTALACION CREDIFUTURO
echo ==========================================
echo.
echo Este script va a forzar la instalacion de todo lo necesario.
echo Puede tardar unos minutos. Por favor espera.
echo.

rem --- Server ---
echo [1/2] Reinstalando SERVIDOR...
if exist "server\node_modules" (
    echo    - Eliminando instalacion anterior dañada...
    rmdir /s /q "server\node_modules"
)
cd server
echo    - Instalando paquetes (esto demora un poco)...
call npm install
if %errorlevel% neq 0 (
    color 4F
    echo [ERROR] Fallo la instalacion del SERVIDOR.
    echo Revisa el mensaje de error de arriba.
    pause
    exit
)
cd ..
echo    - Servidor OK.

rem --- Client ---
echo.
echo [2/2] Reinstalando CLIENTE...
if exist "client\node_modules" (
    echo    - Eliminando instalacion anterior dañada...
    rmdir /s /q "client\node_modules"
)
cd client
echo    - Instalando paquetes (esto demora un poco)...
call npm install
if %errorlevel% neq 0 (
    color 4F
    echo [ERROR] Fallo la instalacion del CLIENTE.
    echo Revisa el mensaje de error de arriba.
    pause
    exit
)
cd ..
echo    - Cliente OK.

echo.
echo ==========================================
echo      REPARACION COMPLETADA CON EXITO
echo ==========================================
echo.
echo Ahora puedes cerrar esta ventana e intentar abrir 'iniciar_aplicacion.bat'.
echo.
pause
