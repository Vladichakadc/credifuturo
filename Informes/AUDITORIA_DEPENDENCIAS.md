# Auditoría de Dependencias (`npm audit`) — Riesgos Residuales

**Fecha:** 2026-05-24
**Ejecutada en:** `security(F3)` — Configuración y Cabeceras de Seguridad
**Comando:** `npm audit --omit=dev` (solo dependencias de producción)
**Estado del audit:** 11 vulnerabilidades (2 low, 3 moderate, 6 high)

---

## Vulnerabilidades aceptadas como riesgo residual

Las siguientes vulnerabilidades **no se pueden resolver sin un cambio mayor** (breaking changes) y se documentan aquí explícitamente para que sean revisadas en una próxima iteración.

### 1. `xlsx` (HIGH) — sin fix disponible

- **Advisories:**
  - `GHSA-4r6h-8v6p-xvw6` — Prototype Pollution en SheetJS
  - `GHSA-5pgg-2g8v-p4x9` — Regular Expression Denial of Service (ReDoS)
- **Estado upstream:** SheetJS movió a su propio CDN. La versión publicada en npm está abandonada.
- **Vector de explotación en Credifuturo:**
  - `BackupService.js` — **solo escribe** Excel (no parsea input externo). No explotable.
  - `DataImportService.js` — parsea Excel, pero está deshabilitado por `ENABLE_EXCEL_SYNC=false` en `.env`. No explotable mientras la variable siga en `false`.
  - Frontend (`client/src/utils/excelUtils.js`) — usa `xlsx` para exportar reportes desde la UI (no parsea archivos del usuario).
- **Conclusión:** **riesgo bajo en uso actual**. Vector requiere ejecución de import Excel con archivo malicioso.
- **Plan de remediación:**
  - Mantener `ENABLE_EXCEL_SYNC=false` en producción (ya es el default).
  - Migrar a `exceljs` o `xlsx-populate` (sin estos CVEs) en una próxima iteración.

### 2. `multer@1.x` (HIGH) — fix solo en multer 2 (breaking)

- **Advisories transitivos:** múltiples vulnerabilidades de DoS en el parser de multipart.
- **Vector de explotación en Credifuturo:** subida de soportes en `/savings/:id/soporte` y `/payments/:id/soporte`. Estos endpoints requieren rol `admin` (defensa en profundidad).
- **Mitigación ya aplicada:**
  - Límite de 10 MB por archivo (`limits: { fileSize: 10 * 1024 * 1024 }`).
  - Validación por magic bytes después del upload (F3 — `services/fileValidator.js`).
  - Endpoints solo admin (un solo admin actualmente).
- **Plan:** migrar a `multer@2.x` cuando estabilice; requiere refactor del API.

### 3. `sequelize` — dependencia transitiva vulnerable de `uuid`

- **Advisory:** `GHSA-w5hq-g745-h8pq` — Missing buffer bounds check en uuid v3/v5/v6.
- **Aplicabilidad:** `uuid` se usa internamente por sequelize; el código de la app no llama directamente a las funciones afectadas (v3/v5/v6 con buffer custom).
- **Plan:** esperar a que sequelize actualice su dependencia transitiva.

### 4. `cacache`, `tar` — transitivas de devDependencies

- No afectan producción (`--omit=dev` los excluye en deploys reales).

---

## Política

- `npm audit fix` (sin `--force`) se debe correr antes de cada release.
- `npm audit fix --force` **no** se ejecuta automáticamente: requiere validación manual del downgrade/upgrade.
- Este documento se actualiza cuando aparezcan nuevas vulnerabilidades o se resuelvan las existentes.

---

## Re-evaluación recomendada

Próximo trimestre o cuando:
- Salga `multer@3` estable.
- SheetJS publique un fix en npm o se decida la migración a `exceljs`.
- Sequelize publique versión que use `uuid >= 11.1.1`.
