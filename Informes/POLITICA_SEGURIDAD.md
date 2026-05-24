# Política de Seguridad Operativa — Credifuturo

**Versión:** 1.0
**Última actualización:** 2026-05-24 (security F4)

Documento de **procesos recurrentes** que mantienen la postura de seguridad alcanzada en las Fases 0-3. Sin estos rituales, la seguridad se degrada con el tiempo.

---

## Frecuencia: Semanal

### Auditoría de dependencias
```bash
cd Credifuturo-Web/server && npm audit --omit=dev
cd Credifuturo-Web/client && npm audit --omit=dev
```
- Documentar nuevas vulnerabilidades en `Informes/AUDITORIA_DEPENDENCIAS.md`.
- Aplicar `npm audit fix` (sin `--force`) si no rompe la app.
- Actualizar el plan de mitigación si aparecen issues con CVSS ≥ 7.

### Revisión de logs de seguridad
```bash
grep "ALERT" Credifuturo-Web/server/logs/security.log | tail -50
grep "LOGIN_FAIL" Credifuturo-Web/server/logs/security.log | wc -l
```
- Investigar cualquier `ALERT_BRUTE_FORCE_SUSPECTED`.
- Si los fallos de login crecen >50% vs la semana anterior, investigar patrón.

---

## Frecuencia: Mensual

### Verificación de backups
1. Listar `C:\Credifuturo\Backups\` y confirmar que hay un backup del día anterior.
2. **Probar restauración en staging:**
   - Copiar el último backup a un entorno aislado.
   - Importarlo a una SQLite vacía.
   - Confirmar que las tablas clave tienen el conteo esperado.
3. **Verificar destino off-site:** si los backups solo viven en `C:\Credifuturo\`, un crash del disco los pierde. Recomendado: subir a S3/Google Drive/OneDrive con cifrado.

### Rotación de logs
- Si `Credifuturo-Web/server/logs/security.log` supera 50 MB, archivar y rotar.
- Mantener al menos 90 días de logs históricos para investigaciones forenses.

---

## Frecuencia: Trimestral

### Revisión de cuentas con privilegios
```sql
SELECT id, email, name, surname1, fechaIngreso, estatus
FROM Clients WHERE role = 'admin';
```
- Confirmar que cada admin **sigue necesitando** el privilegio.
- Desactivar cuentas admin de ex-personal inmediatamente.

### Revisión de cuentas inactivas
- Identificar socios que no se han logueado en 90+ días.
- Considerar marcarlos como `Desactivado` (no eliminar — mantiene integridad referencial).

### Rotación de secretos
- `JWT_SECRET` debe rotarse al menos cada 6 meses, o tras cualquier sospecha de exposición.
- Documentar la rotación con fecha en un log interno (no en este repo).

---

## Frecuencia: Por evento

### Antes de cada deploy a producción
1. `npm audit --omit=dev` debe pasar sin nuevas vulnerabilidades HIGH/CRITICAL.
2. Verificar que `.env` **no está** en el commit (`git status` debe mostrarlos como ignorados).
3. Variables de producción deben estar configuradas en el host:
   - `JWT_SECRET` — el de producción, NO el local.
   - `NODE_ENV=production`.
   - `SETUP_KEY` — **NO debe existir** salvo emergencia operativa puntual.
   - `ALLOWED_ORIGINS` — lista CSV explícita de dominios.

### Al agregar un nuevo admin
1. Crear con `mustChangePassword: true`.
2. Generar contraseña aleatoria (la UI ya lo hace al dejar el prompt vacío).
3. Comunicar contraseña por canal seguro (no email plano si es posible).
4. Confirmar que cambió la contraseña en su primer login.

### Al despedir personal con acceso admin
1. Cambiar `role` a `user` o `estatus` a `Desactivado` **antes** del final del turno.
2. Rotar `JWT_SECRET` si el riesgo de mal uso es alto.
3. Auditar acciones del usuario en los últimos 30 días en `logs/security.log`.

---

## Métricas a reportar mensualmente

- **MTTD** (Mean Time To Detect): minutos entre el primer evento sospechoso y la primera revisión humana. Objetivo: < 1 día (es decir, revisión diaria de logs).
- **MTTR** (Mean Time To Remediate): horas entre detección y resolución. Objetivo: < 4h.
- **# vulnerabilidades HIGH/CRITICAL abiertas** (de `npm audit`). Objetivo: 0 sin justificación documentada.
- **% admins con contraseña que cumple política F1**. Objetivo: 100%.
- **# backups exitosos en el mes** / # backups esperados (30). Objetivo: 100%.

---

## Documentos relacionados

- [Plan de Respuesta a Incidentes](PLAN_RESPUESTA_INCIDENTES.md) — qué hacer cuando ya pasó algo.
- [Auditoría de Dependencias](AUDITORIA_DEPENDENCIAS.md) — estado vivo de `npm audit`.
- [Auditoría de Contraseñas](AUDITORIA_SEGURIDAD_CONTRASENAS.md) — registro histórico de remediación.
