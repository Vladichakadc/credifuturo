# Informe de optimización del PC — 25/05/2026

## Resumen rápido

El equipo NO tiene un problema de gráficos. El cuello de botella real es la **memoria RAM**,
que estaba al **88%** de uso por tener muchas aplicaciones pesadas abiertas a la vez.
Al cerrar algunas, bajó a ~80%. La CPU está bien (sin saturación) y la gráfica NVIDIA no es
el problema.

La mejora más grande y gratuita es sencilla: **mantener menos aplicaciones abiertas a la vez.**

---

## 1. Rendimiento (lo más importante)

### Qué consume más memoria
| Aplicación | Memoria aprox. |
|---|---|
| Antigravity IDE | ~1.000–1.240 MB |
| Claude | ~750–800 MB |
| Google Chrome | ~450 MB |
| Vmmem (máquina virtual / WSL) | ~200 MB |
| Microsoft Teams | ~600 MB |
| McAfee, ChatGPT, WhatsApp, OneDrive, Bun, OneNote… | el resto |

### Acciones recomendadas
- Cierra las apps que no estés usando en el momento (Teams, navegadores de más, etc.).
- Tienes **4 navegadores** instalados y a menudo abiertos: Chrome, Edge, Brave y AdsPower.
  Usa uno como principal y cierra los demás cuando no los necesites — los navegadores con
  muchas pestañas son de lo que más RAM consume.
- Apaga la máquina virtual / WSL cuando no la uses. Forma segura:
  abre **PowerShell** y ejecuta:
  ```
  wsl --shutdown
  ```
  Eso libera el proceso "Vmmem" sin riesgo de corromper datos.
- Revisa los **programas de arranque** (Administrador de tareas → pestaña
  "Aplicaciones de arranque") y desactiva los que no necesites que se inicien solos
  al encender. Esto da una mejora permanente.

---

## 2. Gráficos / Pantalla

Para que el sistema "se sienta" fluido, lo más impactante es la **tasa de refresco**.

### Resolución y frecuencia (Configuración de Windows)
1. Clic derecho en el escritorio → **Configuración de pantalla**.
2. En **Resolución de pantalla**, deja la opción marcada como **(Recomendado)**
   (la nativa del monitor).
3. Entra en **Configuración de pantalla avanzada**.
4. En **Frecuencia de actualización**, selecciona el valor **más alto disponible**
   (60 / 120 / 144 / 165 Hz según tu monitor). Si solo aparece 60 Hz, tu monitor
   no da más y está bien dejarlo ahí.

### Panel NVIDIA (opcional, para juegos / 3D)
1. Clic derecho en el escritorio → **Panel de control de NVIDIA** (o abre "NVIDIA App").
2. **Administrar configuración 3D** → puedes elegir "Optimización por aplicación".
3. Para máximo rendimiento general: "Modo de administración de energía" →
   **Preferir rendimiento máximo** (consume algo más de energía; ideal en equipos de escritorio).
4. Asegúrate de tener el **driver actualizado** (NVIDIA App → pestaña Drivers/Controladores).

> Nota: ninguna "optimización de gráficos" por software acelera un equipo que está
> limitado por RAM. Lo de la sección 1 tiene más impacto en la fluidez del día a día.

---

## 3. Red / Navegación (cambio de DNS)

Cambiar el DNS puede hacer que las páginas web abran un poco más rápido. **Es reversible.**
No aumenta la velocidad de descarga (eso depende del proveedor de internet).

### Cómo cambiar el DNS
1. Panel de control → **Redes e Internet** → **Centro de redes y recursos compartidos**.
2. A la izquierda: **Cambiar configuración del adaptador**.
3. Clic derecho sobre tu conexión activa (Wi-Fi o Ethernet) → **Propiedades**.
4. Selecciona **"Protocolo de Internet versión 4 (TCP/IPv4)"** → botón **Propiedades**.
5. Marca **"Usar las siguientes direcciones de servidor DNS"** y escribe una de estas:
   - **Cloudflare (rápido y privado):** Preferido `1.1.1.1` — Alternativo `1.0.0.1`
   - **Google:** Preferido `8.8.8.8` — Alternativo `8.8.4.4`
6. Aceptar. (Para revertir: vuelve aquí y marca "Obtener la dirección del servidor DNS
   automáticamente".)

### Otros consejos de navegación
- Ten un solo navegador como principal con pocas pestañas abiertas.
- Limpia caché y revisa extensiones que no uses (las extensiones consumen memoria y pueden frenar).

---

## Nota técnica sobre esta sesión

Durante la asistencia, las apps modernas (Configuración de Windows y NVIDIA App) no se
pudieron controlar de forma fiable porque su contenido aparecía oculto en las capturas,
y el Panel de Control clásico no mantenía el foco. Por eso estos pasos se entregan como
guía para aplicarlos manualmente: a ti los menús te responden con normalidad.
