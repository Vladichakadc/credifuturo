# Plan de Respuesta a Incidentes de Seguridad — Credifuturo

**Versión:** 1.0
**Última actualización:** 2026-05-24 (security F4)
**Responsable principal:** Vladimir Escobar (`vladimir.escobar@credifuturo.com`)

---

## 1. Objetivo

Documento operativo que define **qué hacer en los primeros 60 minutos** ante un incidente de seguridad. No describe cómo prevenir (eso lo cubren los controles técnicos de las Fases 0-3), sino cómo **contener, evaluar y recuperar** cuando algo ya pasó.

---

## 2. Escenarios cubiertos

| # | Escenario | Severidad | Tiempo objetivo de contención |
|---|---|---|---|
| A | Acceso no autorizado detectado (login admin sospechoso) | Crítica | < 15 min |
| B | Token JWT comprometido / secreto filtrado | Crítica | < 15 min |
| C | Exfiltración masiva de datos sospechada | Crítica | < 30 min |
| D | Ataque de fuerza bruta sostenido | Alta | < 60 min |
| E | Subida de archivo malicioso | Media | < 60 min |
| F | Pérdida / corrupción de base de datos | Alta | < 60 min |

---

## 3. Procedimientos

### Escenario A — Acceso no autorizado detectado

**Señales:**
- Evento `LOGIN_SUCCESS` con `role=admin` desde IP desconocida en `logs/security.log`.
- Cambios inesperados en la BD (socios eliminados, contraseñas reseteadas, rol cambiado).
- Notificación de un socio sobre actividad rara.

**Pasos:**
1. **Contener — 5 min**
   - Conéctate al panel del host (Railway, Render, etc.) y ejecuta:
     - `JWT_SECRET=<nuevo-valor-128-chars>` → invalida TODAS las sesiones.
     - Reinicia el servicio.
2. **Evaluar — 15 min**
   - `grep ALERT logs/security.log` — busca alertas previas.
   - `grep "role=admin" logs/security.log | tail -50` — verifica IPs del atacante.
   - Consulta `PASSWORD_CHANGED`, `CLIENT_CREATED`, `PASSWORD_RESET_BY_ADMIN` recientes.
3. **Recuperar — 30 min**
   - Si hubo modificación de datos: restaurar desde el último backup confiable (`Backups/`).
   - Cambia tu contraseña de admin (la nueva debe cumplir política F1).
   - Si hay otros admins, oblígales a cambiar password (`mustChangePassword=true` en la BD).

---

### Escenario B — JWT_SECRET filtrado

**Señales:**
- `.env` accidentalmente commiteado.
- Secreto leakeado por error en logs públicos / Slack / pantalla compartida.

**Pasos:**
1. Generar nuevo `JWT_SECRET` con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.
2. Actualizar variable en el host de producción → reiniciar.
3. **Si el secreto quedó en git:** `git filter-repo` para reescribir historial (consultar antes — afecta a otros clones).
4. Avisar a usuarios que deberán re-loguearse.
5. Auditar logs del periodo de exposición buscando `LOGIN_SUCCESS` sospechosos.

---

### Escenario C — Exfiltración de datos sospechada

**Señales:**
- Acceso a `/api/setup/download-db` en logs (debería estar deshabilitado en prod).
- Picos anormales de tráfico saliente.
- Archivos `Backups/*.xlsx` enviados/movidos sin justificación.

**Pasos:**
1. **Bloquear inmediatamente** los endpoints de setup: unset `SETUP_KEY` en producción.
2. Revocar tokens (rotar `JWT_SECRET`).
3. **Cumplimiento legal:** Ley 1581 (Colombia) requiere reportar brechas que afecten datos personales en plazos definidos. Consultar abogado dentro de 24h.
4. Identificar alcance: ¿qué tablas, cuántos socios?
5. Comunicar a socios afectados según lo determine el área legal.

---

### Escenario D — Brute force sostenido

**Señales:**
- Eventos `ALERT_BRUTE_FORCE_SUSPECTED` en logs.
- Muchos `LOGIN_FAIL_*` desde una sola IP o contra un solo email.

**Pasos:**
1. Identificar IP/email objetivo en logs.
2. Si es IP: añadir bloqueo a nivel proxy/Cloudflare/host.
3. Si es contra un email: forzar `mustChangePassword=true` en ese usuario y notificarlo.
4. Verificar que el `loginLimiter` (express-rate-limit) está activo.
5. Si el patrón es distribuido (muchas IPs, un email), considerar habilitar CAPTCHA temporal.

---

### Escenario E — Subida de archivo malicioso

**Señales:**
- Antivirus alerta sobre un soporte descargado.
- Soporte con extensión rara o tamaño anómalo.

**Pasos:**
1. El validador F3 (`verifyFileMagicBytes`) ya rechaza ejecutables. Si pasó algo, revisar logs del upload.
2. Eliminar el soporte de la BD: `DELETE FROM Soportes WHERE id = <id>;`.
3. Revisar otros soportes del mismo admin/IP por correlación.
4. Considerar implementar antivirus en upload (ClamAV) si recurre.

---

### Escenario F — Pérdida / corrupción de BD

**Señales:**
- Errores 500 generalizados al consultar.
- Conteos de tablas en cero o muy distintos.
- Backup automático fallando en logs `[CRON]`.

**Pasos:**
1. **No escribir nada nuevo** — detener el servicio.
2. Localizar último backup confiable en `C:\Credifuturo\Backups\<fecha>/`.
3. Restaurar `database.sqlite` desde backup (verificar timestamp).
4. Reiniciar servicio en modo lectura primero (`SELECT count(*) FROM Clients`).
5. Si todo OK, reabrir escritura.

---

## 4. Roles y contactos

| Rol | Responsable | Contacto |
|---|---|---|
| Operador técnico / IR Lead | Vladimir Escobar | vladimir.escobar@credifuturo.com |
| Asesor legal (Ley 1581) | _A definir_ | _Pendiente_ |
| Comunicación a socios | Vladimir Escobar | _por canal habitual del cooperativa_ |
| Hosting / DNS | Railway (o el actual) | dashboard del proveedor |

---

## 5. Comunicación interna durante un incidente

- **Canal de coordinación:** _A definir_ (recomendado: WhatsApp con stakeholders, NO emails que pueden estar comprometidos).
- **No discutir el incidente** por canales públicos (Slack/Discord públicos, redes sociales) hasta que esté contenido.
- **Registrar timeline** del incidente en un archivo aparte: hora de detección, hora de contención, acciones tomadas. Útil para post-mortem.

---

## 6. Post-mortem (dentro de 7 días del incidente)

Plantilla:
1. **Resumen** — qué pasó, en una frase.
2. **Timeline** — orden cronológico de detección → contención → recuperación.
3. **Causa raíz** — qué falló (técnico u operativo).
4. **Impacto** — cuántos usuarios, qué datos.
5. **Qué funcionó bien** — controles que detuvieron / detectaron.
6. **Qué falló** — controles ausentes o insuficientes.
7. **Acciones correctivas** — con responsable y fecha objetivo.

---

## 7. Pruebas de plan

Recomendado: ejecutar un **simulacro semestral**:
- Rotar `JWT_SECRET` en un horario no productivo y medir cuánto toma + el impacto.
- Restaurar un backup en un entorno staging y confirmar integridad.
- Generar deliberadamente un `ALERT_BRUTE_FORCE_SUSPECTED` y verificar que aparece en logs.
