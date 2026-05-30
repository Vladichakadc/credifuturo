# Credifuturo Web Application

Esta aplicación web gestiona los ahorros y préstamos de los socios de Credifuturo.

## 1. Instalación (Solo una vez)

Necesitas instalar **Node.js**:
1.  Descargar e instalar **Node.js (Versión LTS)** desde [https://nodejs.org/](https://nodejs.org/).
2.  Reiniciar el equipo tras la instalación.

## 2. Iniciar la Aplicación

Simplemente haz doble clic en el archivo:
**`iniciar_aplicacion.bat`**

Esto abrirá dos ventanas negras (servidor y cliente). **No las cierres** mientras usas la aplicación.

## 3. ¿Problemas al Iniciar?

Si al iniciar ves errores como "Cannot find module express" o "'vite' no se reconoce":

1.  Haz doble clic en el archivo **`reparar_instalacion.bat`**.
    *   Este archivo borrará las instalaciones corruptas y volverá a descargar todo desde cero.
2.  Espera a que termine (puede tardar unos minutos).
3.  Vuelve a intentar con `iniciar_aplicacion.bat`.

## Acceso

El login se realiza con **cédula** y contraseña.

*   **Administrador**: la cédula del administrador se asigna como cualquier socio en la base de datos. En el primer arranque (si no existe ningún admin) el sistema crea uno con una contraseña temporal aleatoria que se imprime una sola vez en la consola del servidor; ese admin queda marcado con `mustChangePassword=true` para forzar el cambio en el primer ingreso.

## Solución Manual

Si todo falla, abre una terminal en la carpeta principal y ejecuta:

1.  `cd server` -> `npm install` -> `npm start`
2.  (En otra terminal) `cd client` -> `npm install` -> `npm run dev`
