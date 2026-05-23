# Cargar Tablas de Excel a la Base de Datos

## Resumen

El sistema ya cuenta con un servicio completo de importación de datos (`DataImportService.js`) que maneja las 5 tablas de Excel encontradas en el repositorio:

1. **Tabla_Clientes.xlsx** - Datos de clientes
2. **1-orders_table_ahorro_mensual.xlsx** - Ahorros mensuales
3. **1-orders_table_aportes_iniciales.xlsx** - Aportes iniciales
4. **1-orders_table_prestamos_desembolsados.xlsx** - Préstamos desembolsados
5. **1-orders_table_estado_prestamos.xlsx** - Estado de pagos de préstamos

El objetivo es ejecutar el proceso de importación para cargar todos estos datos en la base de datos SQLite.

## Cambios Propuestos

### Backend - Sin cambios necesarios

El servicio de importación ya está completamente implementado en:
- [DataImportService.js](file:///G:/Mi%20unidad/Credifuturo/Credifuturo-Web/server/services/DataImportService.js) - Servicio con métodos para importar todas las tablas
- [admin.js](file:///G:/Mi%20unidad/Credifuturo/Credifuturo-Web/server/routes/admin.js) - Ruta POST `/api/admin/import-data` ya configurada

El servicio importa en el siguiente orden:
1. Clientes (necesarios para las relaciones)
2. Ahorros (mensuales e iniciales)
3. Préstamos desembolsados
4. Pagos de préstamos

### Frontend - Verificar UI de importación

Necesito verificar si existe un botón en el Admin Dashboard para ejecutar la importación. Si no existe, lo agregaré.

---

## Plan de Verificación

### 1. Verificar Estado Actual de la Base de Datos

Antes de importar, verificaré cuántos registros existen actualmente:

```powershell
# Desde el directorio del servidor
cd "G:/Mi unidad/Credifuturo/Credifuturo-Web/server"
node -e "const sqlite3 = require('sqlite3').verbose(); const db = new sqlite3.Database('G:/Mi unidad/Credifuturo/database.sqlite'); db.all('SELECT name FROM sqlite_master WHERE type=\"table\"', (err, tables) => { console.log('Tables:', tables); tables.forEach(t => { db.get(`SELECT COUNT(*) as count FROM ${t.name}`, (err, row) => console.log(`${t.name}: ${row.count} rows`)); }); });"
```

### 2. Ejecutar la Importación

Ejecutaré la importación usando uno de estos métodos:

**Opción A: Desde el Admin Dashboard (si existe el botón)**
- Iniciar el servidor
- Acceder al Admin Dashboard
- Hacer clic en el botón "Importar Datos"

**Opción B: Usando curl/Postman**
```powershell
# Iniciar el servidor primero
cd "G:/Mi unidad/Credifuturo/Credifuturo-Web/server"
npm start

# En otra terminal, ejecutar:
curl -X POST http://localhost:5000/api/admin/import-data
```

**Opción C: Script Node.js directo**
```javascript
// test_import.js
const ImportService = require('./services/DataImportService');
const sequelize = require('./config/database');

async function testImport() {
    await sequelize.sync();
    const dataDir = 'G:/Mi unidad/Credifuturo';
    const report = await ImportService.importAll(dataDir);
    console.log('Import Report:', JSON.stringify(report, null, 2));
}

testImport().catch(console.error);
```

### 3. Verificar Datos Importados

Después de la importación, verificaré que los datos se cargaron correctamente:

```powershell
# Contar registros en cada tabla
node -e "const sqlite3 = require('sqlite3').verbose(); const db = new sqlite3.Database('G:/Mi unidad/Credifuturo/database.sqlite'); ['Clients', 'Savings', 'DisbursedLoans', 'LoanPayments'].forEach(table => { db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => console.log(`${table}: ${row ? row.count : 0} registros`)); });"
```

### 4. Verificación Manual en el Dashboard

- Acceder al Admin Dashboard
- Verificar que las tablas muestren datos:
  - Lista de clientes
  - Ahorros
  - Préstamos desembolsados
  - Reportes con datos reales

> [!IMPORTANT]
> La importación puede tardar varios segundos dependiendo del tamaño de los archivos Excel. El servicio procesa cada fila individualmente para manejar errores de manera granular.

> [!NOTE]
> Si ya existen datos en la base de datos, el servicio usa `findOrCreate` para clientes (evita duplicados por `customerId`), pero crea nuevos registros para savings, loans y payments. Si necesitas limpiar la base de datos primero, puedo agregar esa opción.
