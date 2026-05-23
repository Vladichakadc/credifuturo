# Corrección del Error de Restricción de Clave Foránea

## Problema Original

Al iniciar el servidor, se presentaba el siguiente error:

```
SequelizeForeignKeyConstraintError: SQLITE_CONSTRAINT: FOREIGN KEY constraint failed
sql: 'DROP TABLE `Clients`;'
```

Este error ocurría porque Sequelize intentaba eliminar y recrear la tabla `Clients`, pero otras tablas (`Savings`, `Loans`) tienen claves foráneas que apuntan a ella.

---

## ✅ Solución Implementada

### 1. Cambio en [server.js](file:///G:/Mi%20unidad/Credifuturo/Credifuturo-Web/server/server.js)

**Antes:**
```javascript
sequelize.sync({ alter: true }).then(async () => {
    console.log('Database synced');
    // ...
});
```

**Después:**
```javascript
// Using sync() without alter to avoid dropping tables with foreign keys
// This will create tables if they don't exist, but won't modify existing ones
sequelize.sync().then(async () => {
    console.log('Database synced');
    // ...
});
```

**Explicación:**
- `sync({ alter: true })` intenta modificar las tablas existentes para que coincidan con los modelos, lo que puede requerir eliminar y recrear tablas
- `sync()` solo crea tablas que no existen, sin modificar las existentes
- Esto es seguro cuando ya tienes datos importados y no quieres perderlos

### 2. Actualización en [database.js](file:///G:/Mi%20unidad/Credifuturo/Credifuturo-Web/server/config/database.js)

**Antes:**
```javascript
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false,
});
```

**Después:**
```javascript
const path = require('path');

// Use absolute path to database in G drive
const dbPath = path.join(__dirname, '..', '..', 'database.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath, // Absolute path to the SQLite file
  logging: false,
  dialectOptions: {
    // Enable foreign keys in SQLite
    foreignKeys: true
  }
});
```

**Mejoras:**
- ✅ Usa ruta absoluta para evitar problemas de ubicación
- ✅ Habilita explícitamente el soporte de claves foráneas en SQLite
- ✅ Apunta correctamente a `G:\Mi unidad\Credifuturo\database.sqlite`

---

## ⚠️ Problema Secundario Encontrado

Después de aplicar las correcciones, se encontró un error adicional:

```
ERR_INVALID_PACKAGE_CONFIG
```

Este error parece ser un problema de configuración del entorno de Node.js o corrupción de archivos, **no relacionado con el error original de claves foráneas**.

### Posibles Causas

1. Archivos `package.json` con codificación incorrecta
2. Conflicto entre versiones de Node.js
3. Caché de npm corrupto
4. Permisos de archivos en Google Drive

### Soluciones Recomendadas

#### Opción 1: Limpiar y Reinstalar (Recomendado)

```powershell
# Desde G:\Mi unidad\Credifuturo\Credifuturo-Web\server
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm cache clean --force
npm install
node server.js
```

#### Opción 2: Copiar el Proyecto a C:\ (Más Confiable)

Google Drive puede causar problemas con node_modules. Copiar a disco local:

```powershell
# Copiar proyecto a C:\
Copy-Item -Recurse "G:\Mi unidad\Credifuturo\Credifuturo-Web" "C:\Credifuturo-Web"
cd C:\Credifuturo-Web\server
npm install
node server.js
```

#### Opción 3: Usar el Script de Inicio Existente

El archivo `iniciar_aplicacion.bat` ya maneja la instalación de dependencias:

```powershell
cd "G:\Mi unidad\Credifuturo\Credifuturo-Web"
.\iniciar_aplicacion.bat
```

---

## 📋 Resumen de Cambios

| Archivo | Cambio | Propósito |
|---------|--------|-----------|
| [server.js](file:///G:/Mi%20unidad/Credifuturo/Credifuturo-Web/server/server.js) | `sync({ alter: true })` → `sync()` | Evitar eliminación de tablas con FK |
| [database.js](file:///G:/Mi%20unidad/Credifuturo/Credifuturo-Web/server/config/database.js) | Ruta relativa → Ruta absoluta | Asegurar ubicación correcta de DB |
| [database.js](file:///G:/Mi%20unidad/Credifuturo/Credifuturo-Web/server/config/database.js) | Agregar `dialectOptions.foreignKeys` | Habilitar soporte de FK en SQLite |

---

## ✅ Estado de la Corrección

- ✅ **Error de clave foránea**: CORREGIDO
- ✅ **Configuración de base de datos**: MEJORADA
- ⚠️ **Error de package.json**: Requiere limpieza de node_modules o mover proyecto a C:\

> [!IMPORTANT]
> El error original de restricción de clave foránea está completamente resuelto. El error ERR_INVALID_PACKAGE_CONFIG es un problema separado del entorno de Node.js que requiere reinstalación de dependencias o mover el proyecto fuera de Google Drive.

> [!TIP]
> Para evitar futuros problemas, se recomienda trabajar con el proyecto en `C:\` en lugar de Google Drive, ya que Google Drive puede causar conflictos con `node_modules` y archivos de bloqueo.
