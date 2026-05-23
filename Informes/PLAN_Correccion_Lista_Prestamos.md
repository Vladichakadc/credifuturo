# Plan de Corrección Permanente - Lista de Préstamos

## Diagnóstico
Se identificó que el mapeo en `DataImportService.js` falla debido a discrepancias exactas en los encabezados del Excel y nombres de campos en la base de datos.

### Tabla de Mapeo Real (Auditoría)
| Campo UI | Columna Excel (Normalizada) | Destino Model (DisbursedLoan) | Nota |
| :--- | :--- | :--- | :--- |
| **ID Préstamo** | `id_vm` | `idVm` (y `orderId`) | Se sincronizarán ambos campos por compatibilidad. |
| **Fecha Préstamo** | `fecha prestamo` | `fechaPrestamo` | Excel no tiene "de" en el nombre. |
| **# Cuotas** | `# cuotas prestamo` | `cuotas` | Excel tiene nombre más largo. |
| **Días Pago Max** | `dias de pago max` | `diasPagoMax` | Se normaliza quitando espacios extra. |

## Cambios Propuestos

### Backend: Refuerzo del Mapeo
#### [MODIFY] [DataImportService.js](file:///C:/Credifuturo/Credifuturo-Web/server/services/DataImportService.js)
- Actualizar `importDisbursed` para usar las claves correctas extraídas del Excel.
- Asegurar que `idVm` se guarde en el modelo (actualmente solo se usa `orderId`).
- Normalizar la limpieza de strings para evitar espacios invisibles.

### Frontend: Consistencia de Visualización
#### [MODIFY] [LoansListPage.jsx](file:///C:/Credifuturo/Credifuturo-Web/client/src/pages/admin/LoansListPage.jsx)
- Verificar que las claves usadas en la tabla coincidan con las enviadas por la API (`idVm`, `fechaPrestamo`, `cuotas`, `diasPagoMax`).

## Plan de Verificación
1. **Sincronización**: Ejecutar un sync completo y verificar logs personalizados.
2. **API**: Validar `GET /api/admin/disbursed-loans` con `curl` o script.
3. **UI**: Comprobar visualmente que las 4 columnas críticas muestran datos reales.
