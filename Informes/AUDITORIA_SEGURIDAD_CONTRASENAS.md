# Auditoría de Seguridad — Sistema de Contraseñas Credifuturo

**Fecha:** 21 de mayo de 2026  
**Versión:** 1.0  
**Estado:** Implementado ✅

---

## 1. Resumen Ejecutivo

Se realizó una auditoría completa del sistema de autenticación y gestión de contraseñas de Credifuturo. Se identificaron **10 hallazgos de seguridad**, de los cuales **4 fueron corregidos en esta iteración**. Se implementaron tres funcionalidades nuevas: cambio obligatorio de contraseña en primer ingreso, recuperación de contraseña asistida por el administrador, y corrección del cifrado en la actualización de socios.

---

## 2. Auditoría del Estado Anterior

### 2.1 Cifrado de Contraseñas

| Componente | Hallazgo | Riesgo |
|---|---|---|
| Algoritmo | BCryptJS · 10 salt rounds | ✅ Correcto |
| Registro de socios (`POST /clients`) | Hashea correctamente | ✅ OK |
| Actualización de socios (`PUT /clients/:id`) | **Guardaba contraseña en texto plano** | 🔴 Crítico |
| Scripts de importación (`import_data.js`) | Hash correcto | ✅ OK |
| Reset masivo (`set_user_passwords.js`) | Hash correcto | ✅ OK |

**Contraseñas por defecto encontradas:**

| Contexto | Contraseña por defecto |
|---|---|
| Socios importados (`import_data.js`) | `123` |
| Creación desde admin panel | `123` |
| Admin principal (`seed-admin.js`) | `Admin2026!` |
| Reset masivo (`set_user_passwords.js`) | `Cf@2026` |
| Reset administrativo (nuevo) | `CF2026` |

### 2.2 Autenticación JWT

| Componente | Hallazgo | Riesgo |
|---|---|---|
| JWT Secret en `auth.js` | Hardcodeado: `credifuturo_secret_key_change_me` | ⚠️ Medio |
| JWT Secret en `authMiddleware.js` | Mismo valor hardcodeado | ⚠️ Medio |
| Variable `JWT_SECRET` en `.env` | `super_secret_key_credifuturo_2026` — **ignorada** | ⚠️ Medio |
| Expiración del token | 8 horas | ✅ Aceptable |
| Almacenamiento en cliente | `localStorage` | ⚠️ Aceptable (sin HTTPS) |

> **Nota:** El secret hardcodeado en código es un riesgo menor en un entorno de red local sin exposición a internet, pero debe corregirse si la aplicación se expone externamente.

### 2.3 Gestión de Contraseñas (antes de esta implementación)

| Funcionalidad | Estado previo |
|---|---|
| Cambio obligatorio en primer ingreso | ❌ No existía |
| Recuperación de contraseña | ❌ Solo texto estático "contacte soporte" |
| Validación de complejidad | ❌ No existía |
| Expiración de contraseña | ❌ No existía |
| Auditoría de cambios | ❌ No existía |
| Servicio de correo electrónico | ❌ Sin nodemailer ni SMTP |

### 2.4 Control de Acceso

| Componente | Hallazgo |
|---|---|
| `ProtectedRoute` en frontend | Verificaba rol pero no primer ingreso |
| Forzado de rol admin por email | `admin@credifuturo.com` siempre es admin (hardcodeado) |
| Rutas del modelo `Client` | Campo `mustChangePassword` no existía |

---

## 3. Plan de Trabajo Ejecutado

### Fase 1 — Corrección Crítica (urgente)

**Tarea 1.1 — Cifrado en actualización de socios**  
`server/routes/admin.js` · línea ~237

- **Problema:** `await client.update(req.body)` guardaba la contraseña en texto plano si el admin la modificaba desde el panel.
- **Solución:** Se agregó hash bcrypt antes de la actualización:
  ```js
  if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, 10);
  }
  ```
- **Estado:** ✅ Corregido

---

### Fase 2 — Cambio Obligatorio en Primer Ingreso

**Tarea 2.1 — Campo en base de datos**
- Se agregó columna `mustChangePassword` (INTEGER, NOT NULL, DEFAULT 0) a la tabla `Clients` mediante migración directa con `ALTER TABLE`.
- Usuarios existentes: valor `0` (no se interrumpe el acceso actual).
- Usuarios nuevos: valor `1` (deben cambiar contraseña al primer ingreso).
- **Archivo:** `server/models/Client.js`
- **Estado:** ✅ Implementado

**Tarea 2.2 — Login incluye flag en JWT**
- El endpoint `POST /api/auth/login` ahora incluye `mustChangePassword` en el payload del JWT y en la respuesta.
- El frontend detecta el flag y redirige a `/change-password` automáticamente.
- **Archivo:** `server/routes/auth.js`
- **Estado:** ✅ Implementado

**Tarea 2.3 — Endpoint cambio de contraseña**
- Nuevo endpoint: `PUT /api/auth/change-password` (requiere JWT válido)
- Valida contraseña actual con bcrypt
- Reglas mínimas: 6 caracteres y al menos 1 número
- Al cambiar exitosamente: `mustChangePassword = false` + emite nuevo JWT limpio
- **Archivo:** `server/routes/auth.js`
- **Estado:** ✅ Implementado

**Tarea 2.4 — Guard en el router**
- `ProtectedRoute` en `App.jsx` redirige a `/change-password` si `user.mustChangePassword === true`
- La ruta `/change-password` es pública (no requiere rol pero sí sesión activa)
- **Archivo:** `client/src/App.jsx`
- **Estado:** ✅ Implementado

**Tarea 2.5 — Página de cambio de contraseña**
- Nueva página: `client/src/pages/ChangePasswordPage.jsx`
- Campos: Contraseña actual · Nueva contraseña · Confirmar nueva
- Barra de fortaleza visual (5 niveles: Muy débil → Muy fuerte)
- Validación en tiempo real de coincidencia
- Checklist de reglas visuales (✓ verde al cumplirse)
- Aviso de primer ingreso si `mustChangePassword === true`
- **Estado:** ✅ Implementado

---

### Fase 3 — Recuperación de Contraseña (sin correo electrónico)

> **Restricción de diseño:** No hay servicio SMTP disponible. El flujo es asistido por el administrador.

**Tarea 3.1 — Modelo PasswordResetRequest**
- Nueva tabla: `PasswordResetRequests`
- Campos: `id`, `clientId`, `cedula`, `nombre`, `email`, `status` (pending/resolved), `createdAt`, `updatedAt`
- Creada automáticamente por `sequelize.sync()` al iniciar el servidor
- **Archivo:** `server/models/PasswordResetRequest.js`
- **Estado:** ✅ Implementado

**Tarea 3.2 — Endpoint solicitud de reset**
- Nuevo endpoint: `POST /api/auth/request-reset` (sin autenticación)
- Acepta `cedula` o `email`
- Respuesta genérica por seguridad (no revela si el usuario existe)
- Evita solicitudes duplicadas pendientes del mismo socio
- **Archivo:** `server/routes/auth.js`
- **Estado:** ✅ Implementado

**Tarea 3.3 — Modal en página de login**
- El enlace "¿Olvidó su contraseña?" ahora abre un modal funcional
- El socio ingresa su cédula o correo
- Mensaje de confirmación al enviar la solicitud
- **Archivo:** `client/src/pages/Login.jsx`
- **Estado:** ✅ Implementado

**Tarea 3.4 — Endpoints admin de gestión**
- `POST /api/admin/clients/:id/reset-password` — Asigna contraseña temporal `CF2026`, activa `mustChangePassword = true`, marca solicitudes pendientes como resueltas
- `GET /api/admin/password-reset-requests` — Lista todas las solicitudes con estado
- `PUT /api/admin/password-reset-requests/:id/resolve` — Marca una solicitud como resuelta manualmente
- **Archivo:** `server/routes/admin.js`
- **Estado:** ✅ Implementado

**Tarea 3.5 — Panel de solicitudes en módulo Socios**
- Botón **Solicitudes** con badge rojo de contador en la cabecera de `ClientsPage`
- Panel expandible con tabla: Socio · Cédula · Correo · Fecha · Estado · Acción
- Botón **Resetear y resolver** por fila pendiente
- Botón **Resetear Contraseña** visible cuando se está editando un socio específico
- **Archivo:** `client/src/pages/admin/ClientsPage.jsx`
- **Estado:** ✅ Implementado

---

## 4. Archivos Modificados / Creados

| Archivo | Tipo | Cambio |
|---|---|---|
| `server/models/Client.js` | Modificado | Campo `mustChangePassword` |
| `server/models/PasswordResetRequest.js` | **Nuevo** | Modelo de solicitudes |
| `server/routes/auth.js` | Modificado | mustChangePassword en JWT; endpoints change-password y request-reset |
| `server/routes/admin.js` | Modificado | Fix hash PUT; endpoints reset-password y password-reset-requests |
| `server/server.js` | Modificado | Registro del nuevo modelo |
| `client/src/pages/ChangePasswordPage.jsx` | **Nuevo** | Página de cambio de contraseña |
| `client/src/pages/Login.jsx` | Modificado | Modal "Olvidé mi contraseña" + redirección mustChangePassword |
| `client/src/App.jsx` | Modificado | Guard ProtectedRoute + ruta /change-password |
| `client/src/pages/admin/ClientsPage.jsx` | Modificado | Botón reset + panel solicitudes |

---

## 5. Rollback

El backup completo fue creado antes de iniciar la implementación:

```
C:\Credifuturo\Backups\rollback_20260521_203215\
├── database.sqlite          (copia exacta de la BD)
├── auth.js
├── admin.js
├── Client.js
├── server.js
├── App.jsx
├── Login.jsx
└── ClientsPage.jsx
```

**Procedimiento de rollback:**
1. Detener ambos servidores (frontend y backend)
2. Copiar los archivos `.js` y `.jsx` del backup a sus rutas originales
3. Reemplazar `database.sqlite` con la copia del backup
4. Reiniciar los servidores

---

## 6. Hallazgos Pendientes (fuera de alcance de esta iteración)

| Hallazgo | Riesgo | Acción recomendada |
|---|---|---|
| JWT Secret hardcodeado | ⚠️ Medio | Leer de `process.env.JWT_SECRET` en ambos archivos |
| Sin validación de complejidad en creación de socios | 🟡 Bajo | Agregar reglas al formulario de ClientsPage |
| Sin expiración de contraseña | 🟡 Bajo | Agregar campo `passwordChangedAt` y política de 90 días |
| Sin auditoría de intentos fallidos de login | 🟡 Bajo | Implementar rate-limiting o log de intentos |
| Contraseña por defecto `123` muy débil | 🟡 Bajo | Cambiar default a `CF2026` en formulario de creación |
| Forzado de rol admin por email hardcodeado | ⚠️ Medio | Eliminar y confiar solo en el campo `role` de la BD |

---

## 7. Flujo de Usuario — Primer Ingreso

```
Socio recibe credenciales del admin
        │
        ▼
Ingresa email + contraseña en Login
        │
        ▼
Backend valida → mustChangePassword = true
        │
        ▼
Frontend redirige a /change-password
        │
        ▼
Socio ingresa contraseña actual (CF2026 o 123)
+ Nueva contraseña (mín. 6 chars + 1 número)
+ Confirmar nueva contraseña
        │
        ▼
Backend hashea y guarda → mustChangePassword = false
Backend emite nuevo JWT limpio
        │
        ▼
Socio accede al dashboard normalmente
```

## 8. Flujo de Usuario — Recuperación de Contraseña

```
Socio no recuerda su contraseña
        │
        ▼
Clic en "Solicitar restablecimiento" en Login
        │
        ▼
Ingresa cédula o correo electrónico
        │
        ▼
Backend registra solicitud en PasswordResetRequests
Socio ve: "Solicitud registrada. El administrador le contactará."
        │
        ▼
Admin ve badge rojo en módulo Socios
        │
        ▼
Admin abre panel "Solicitudes"
Admin clic en "Resetear y resolver"
        │
        ▼
Contraseña temporal CF2026 asignada
mustChangePassword = true
Solicitud marcada como Resuelta
        │
        ▼
Admin informa al socio su contraseña temporal
        │
        ▼
Socio inicia sesión con CF2026
→ Redirigido a /change-password (flujo primer ingreso)
```
