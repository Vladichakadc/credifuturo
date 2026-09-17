const fs = require('fs');
const path = require('path');

/**
 * El informe que el socio recibe cuando su abono baja las cuotas.
 *
 * Nace de un caso real: una socia abonó $221.333 de más y nadie le explicó qué
 * pasó con ese dinero. El fondo lo aplicó bien —las cuotas bajaron— pero eso
 * solo se veía mirando el cronograma cuota por cuota y sabiendo interpretarlo.
 * El informe lo pone por escrito: qué pagó de más, cómo quedó cada cuota, y
 * cuánto se ahorró en intereses.
 *
 * ── POR QUÉ MARKDOWN Y NO PDF ───────────────────────────────────────────────
 *
 * El visor ya renderiza Markdown con tablas, así que no hace falta traer una
 * librería de PDF al servidor ni arriesgar el build. Pero la razón de peso es
 * otra: es texto. Se puede leer sin la aplicación, comparar dos versiones y
 * archivar. Un documento que explica el dinero de alguien debe seguir siendo
 * legible dentro de diez años, y un blob binario generado por una dependencia
 * que quizá ya no exista no da esa garantía.
 *
 * ── DÓNDE VIVE ──────────────────────────────────────────────────────────────
 *
 * En el volumen, junto a las copias de seguridad. El sistema de archivos del
 * contenedor NO es almacenamiento: `shared-informes/` viaja en la imagen y
 * cualquier cosa escrita ahí en caliente desaparece en el siguiente despliegue.
 * Es la misma trampa que ya se llevó por delante el registro de accesos.
 */

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const enLetras = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

/** Nombre estable y sin datos personales: el crédito y la fecha bastan. */
function nombreArchivo(idVm, fecha = new Date()) {
    return `Abono_${String(idVm).replace(/[^A-Za-z0-9_-]/g, '')}_${fecha.toISOString().slice(0, 10)}.md`;
}

/**
 * Construye el informe. `plan` es lo que devuelve planificarPrestamo, con los
 * cambios ya calculados (antes/después de cada cuota).
 */
/** Las tres cifras que resumen el informe, para la tarjeta de la lista. */
function resumenDelInforme(plan) {
    const r = plan.resumen || {};
    const cambios = (plan.cambios || []).filter((c) => c.difiere || c.cancelar);
    const primera = cambios[0];
    return {
        excedente: Math.round(Number(r.excedente) || 0),
        ahorroInteres: Math.round(Number(r.ahorroInteres) || 0),
        bajaMensual: primera
            ? Math.round(Number(primera.antes.valorCuotaVariable) - Number(primera.despues.valorCuotaVariable))
            : 0,
    };
}

function construirMarkdown({ plan, socio, idVm }) {
    const r = plan.resumen || {};
    const cambios = (plan.cambios || []).filter((c) => c.difiere || c.cancelar);

    // Lo que de verdad le importa al socio: cuánto baja su cuota cada mes.
    const primera = cambios[0];
    const bajaMensual = primera ? (primera.antes.valorCuotaVariable - primera.despues.valorCuotaVariable) : 0;

    const totalAntes = cambios.reduce((s, c) => s + Number(c.antes.valorCuotaVariable || 0), 0);
    const totalDespues = cambios.reduce((s, c) => s + Number(c.despues.valorCuotaVariable || 0), 0);

    const filas = cambios.map((c) => {
        const antes = Number(c.antes.valorCuotaVariable || 0);
        const despues = Number(c.despues.valorCuotaVariable || 0);
        const baja = antes - despues;
        const etiqueta = c.cancelar ? '**cancelada**' : (baja > 0 ? `−${pesos(baja)}` : '—');
        return `| ${c.itemQuantity ?? c.cuota} | ${c.cuota} | ${pesos(antes)} | ${pesos(despues)} | ${etiqueta} | ${pesos(c.despues.saldoFinal)} |`;
    }).join('\n');

    const nombre = [socio?.name, socio?.surname1, socio?.apellido1].filter(Boolean).join(' ').trim() || 'Socio';

    return `# Tu abono a capital — crédito ${idVm}

**${nombre}** · ${enLetras(new Date())}

Pagaste **${pesos(r.excedente)}** por encima de tu cuota. Ese dinero no se perdió
ni quedó a favor del fondo: **abonó directamente a capital** y se usó para
**bajar el valor de tus cuotas siguientes**. Aquí está cómo quedaron.

## En resumen

| | |
|---|---|
| Abonaste a capital | **${pesos(r.excedente)}** |
| Tu cuota bajó | **${pesos(bajaMensual)}** cada mes |
| Te ahorraste en intereses | **${pesos(r.ahorroInteres)}** |
${r.sobrante > 0 ? `| A tu favor, por devolver | **${pesos(r.sobrante)}** |\n` : ''}
## Tus cuotas, antes y ahora

El *saldo después* es lo que te queda por pagar de capital una vez abonada esa cuota.

| Cuota | ID_EP | Antes | Ahora | Baja | Saldo después |
|---|---|---|---|---|---|
${filas}
| | **TOTAL** | **${pesos(totalAntes)}** | **${pesos(totalDespues)}** | **−${pesos(totalAntes - totalDespues)}** | |

## Cómo se comprueba

Pagaste **${pesos(r.excedente)}** de más y lo que te quedaba por pagar bajó
**${pesos(totalAntes - totalDespues)}**. La diferencia entre las dos cifras,
**${pesos(r.ahorroInteres)}**, son los intereses que ya no vas a pagar: al bajar
el saldo, cada mes se te cobra interés sobre una deuda menor.

> ${pesos(r.excedente)} abonado a capital + ${pesos(r.ahorroInteres)} de intereses ahorrados = ${pesos(totalAntes - totalDespues)} menos por pagar

El crédito conserva su plazo y su tasa: lo que cambió es el valor de cada cuota,
porque el capital sobre el que se calculan los intereses es menor.

---

*Generado automáticamente por el Fondo Familiar Credifuturo al aplicarse el
abono. Cualquier duda, escríbele al comité administrativo.*
`;
}

/**
 * Escribe el informe en el volumen y devuelve su nombre. No lanza: un informe
 * que no se pudo escribir no puede tumbar la aplicación del abono, que es la
 * operación que de verdad importa.
 */
function guardarInforme({ dir, plan, socio, idVm }) {
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const nombre = nombreArchivo(idVm);
        fs.writeFileSync(path.join(dir, nombre), construirMarkdown({ plan, socio, idVm }), 'utf-8');
        return nombre;
    } catch (err) {
        console.warn('[INFORME] No se pudo escribir el informe del abono:', err.message);
        return null;
    }
}

// ── Dónde viven y quién es su dueño ─────────────────────────────────────────
//
// Viven aquí y no en routes/admin.js para no crear una dependencia circular:
// admin.js ya requiere abonoCapital, y abonoCapital necesita publicar informes.
const INFORMES_SOCIO_DIR = path.join(
    path.dirname(process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'database.sqlite')),
    'Informes'
);
const CLAVE_INFORMES_SOCIO = 'informes.socios';

async function leerRegistroInformes() {
    try {
        const AppSetting = require('../models/AppSetting');
        const fila = await AppSetting.findOne({ where: { key: CLAVE_INFORMES_SOCIO } });
        const obj = fila?.value ? JSON.parse(fila.value) : {};
        return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch { return {}; }
}

/**
 * Deja el informe registrado a nombre del socio Y se lo avisa.
 *
 * El aviso va AQUÍ y no en cada sitio que publique un informe, porque este es
 * el punto único por el que un documento pasa a ser de alguien: lo que se
 * registre por cualquier vía —el abono automático, la siembra de uno anterior,
 * lo que venga después— queda avisado sin que haya que acordarse.
 *
 * Un documento que aparece en el menú de una persona sin avisarle es un
 * documento que no se va a leer: nadie entra a mirar si hay algo nuevo en un
 * sitio donde nunca hubo nada. Y este en concreto le explica qué pasó con su
 * dinero, así que enterarse no es un detalle.
 *
 * No notificar es la excepción (`notificar: false`), para poder re-registrar un
 * informe —corregir su título, añadirle cifras— sin volver a sonar la campana
 * por algo que el socio ya vio.
 */
async function registrarInformeSocio(nombre, datos, { notificar = true } = {}) {
    const AppSetting = require('../models/AppSetting');
    const registro = await leerRegistroInformes();
    const yaEstaba = Boolean(registro[nombre]);
    registro[nombre] = { ...datos, generadoEl: datos.generadoEl || new Date().toISOString() };
    await AppSetting.upsert({ key: CLAVE_INFORMES_SOCIO, value: JSON.stringify(registro) });

    // Solo la primera vez, y solo si sabemos a quién. El aviso no puede tumbar
    // el registro: el informe ya está publicado y eso es lo que importa.
    if (notificar && !yaEstaba && datos.cedula) {
        try {
            const Client = require('../models/Client');
            const { createNotification } = require('./NotificationService');
            const socio = await Client.findOne({ where: { cedula: String(datos.cedula) } });
            if (socio) {
                const r = datos.resumen || {};
                const detalle = r.bajaMensual > 0
                    ? `Tu cuota bajó ${pesos(r.bajaMensual)} cada mes y te ahorraste ${pesos(r.ahorroInteres)} en intereses.`
                    : 'Ábrelo para ver el detalle.';
                await createNotification({
                    clientId: socio.id,
                    type: 'informe',
                    title: 'Tienes un informe nuevo',
                    message: `${datos.titulo || nombre}. ${detalle}`,
                    // Lleva directo al documento, no al listado: el aviso dice que
                    // hay algo que leer, así que el clic tiene que abrirlo.
                    link: `/dashboard/informes/${encodeURIComponent(nombre)}`,
                });
            }
        } catch (err) {
            console.warn('[INFORME] Registrado, pero no se pudo avisar al socio:', err.message);
        }
    }
    return registro;
}

/** Escribe el informe y lo deja registrado a nombre del socio. Nunca lanza. */
async function publicarInforme({ plan, socio, idVm }) {
    try {
        const nombre = guardarInforme({ dir: INFORMES_SOCIO_DIR, plan, socio, idVm });
        if (!nombre || !socio) return null;
        await registrarInformeSocio(nombre, {
            cedula: socio.cedula,
            socio: [socio.name, socio.surname1].filter(Boolean).join(' ').trim(),
            titulo: `Tu abono a capital — crédito ${idVm}`,
            idVm,
            // Con esto la lista puede decir "tu cuota bajó $23.220 al mes" sin
            // abrir el archivo. Un listado de nombres no le dice nada a nadie.
            resumen: resumenDelInforme(plan),
        });
        return nombre;
    } catch (err) {
        console.warn('[INFORME] No se pudo publicar el informe del abono:', err.message);
        return null;
    }
}

/**
 * El informe de Gimena, que ya existía antes de que esto se automatizara.
 *
 * Se generó a mano al investigar su caso y quedó en `Informes/` del repositorio,
 * visible solo para el gerente. Registrarlo aquí lo pone donde tiene que estar:
 * en el menú de ella. Corre una sola vez —si la clave ya lo tiene, no se toca—
 * y se identifica por cédula, que es lo que permite hacerlo sin leer la base de
 * producción.
 */
async function sembrarInformeGimena() {
    const registro = await leerRegistroInformes();
    const NOMBRE = 'Abono_SOL30_Gimena_Tascon.pdf';
    if (registro[NOMBRE]) return { sembrado: false, yaEstaba: true, deQuien: registro[NOMBRE].cedula };
    await registrarInformeSocio(NOMBRE, {
        cedula: '65772720',
        socio: 'Gimena Tascón',
        titulo: 'Tu abono a capital — crédito SOL30',
        idVm: 'SOL30',
        generadoEl: '2026-09-16T00:00:00.000Z',
        resumen: { excedente: 221333, ahorroInteres: 18592, bajaMensual: 23220 },
    });
    return { sembrado: true, nombre: NOMBRE };
}

module.exports = {
    sembrarInformeGimena,
    construirMarkdown, resumenDelInforme, guardarInforme, nombreArchivo, publicarInforme,
    INFORMES_SOCIO_DIR, CLAVE_INFORMES_SOCIO, leerRegistroInformes, registrarInformeSocio,
};
