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

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const pesos = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * El día en Colombia, no el del reloj del servidor.
 *
 * El contenedor de producción corre en UTC. Un abono registrado a las nueve de
 * la noche del 4 de octubre salía fechado el 5: en el nombre del archivo, que
 * se armaba con la fecha UTC, y en el encabezado, que leía la del contenedor.
 */
function diaBogota(fecha = new Date()) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(fecha instanceof Date ? fecha : new Date(fecha));
    const v = (tipo) => partes.find((p) => p.type === tipo).value;
    return { anio: Number(v('year')), mes: Number(v('month')), dia: Number(v('day')), iso: `${v('year')}-${v('month')}-${v('day')}` };
}

const enLetras = (fecha) => {
    const d = diaBogota(fecha);
    return `${d.dia} de ${MESES[d.mes - 1]} de ${d.anio}`;
};

/**
 * Nombre estable y sin datos personales: el crédito, la cuota y la fecha.
 *
 * La cuota va en el nombre porque dos abonos del mismo crédito pueden
 * registrarse el mismo día —quien se pone al día anota dos meses en una tarde—
 * y con solo el crédito y la fecha el segundo informe pisaba al primero: mismo
 * archivo, misma entrada en el registro. Volver a aplicar el abono de la MISMA
 * cuota sí reescribe su informe, que es lo que se quiere.
 */
function nombreArchivo(idVm, fecha = new Date(), numero = null) {
    const cuota = numero !== null && numero !== undefined && String(numero).trim() !== ''
        ? `_cuota${String(numero).replace(/[^A-Za-z0-9]/g, '')}` : '';
    return `Abono_${String(idVm).replace(/[^A-Za-z0-9_-]/g, '')}${cuota}_${diaBogota(fecha).iso}.md`;
}

/** Las cuotas del plan que cambian de verdad para el socio. */
const cambiosDe = (plan) => (plan.cambios || []).filter((c) => c.difiere || c.cancelar);

/** Cuánto baja el valor de una cuota con el reajuste. */
const bajaDe = (c) => num(c.antes && c.antes.valorCuotaVariable) - num(c.despues && c.despues.valorCuotaVariable);

/**
 * Lo que baja la cuota cada mes: la primera que de verdad baja.
 *
 * No es `cambios[0]`: cuando el abono lo aplica el barrido, la propia cuota
 * abonada entra en los cambios —se le corrige el saldo final— y su valor no se
 * mueve porque ya está pagada. Tomarla daba "tu cuota bajó $0 cada mes".
 */
function bajaMensualDe(cambios) {
    const primera = cambios.find((c) => !c.cancelar && bajaDe(c) > 0.5);
    return primera ? bajaDe(primera) : 0;
}

/**
 * A qué cuota corresponde el informe. Un crédito puede recibir varios abonos, y
 * dos documentos con el mismo título y cifras distintas no se distinguen en la
 * lista del socio ni en su campana.
 */
function tituloDe(idVm, plan) {
    const numeros = [...new Set(((plan && plan.abonos) || [])
        .map((a) => a.numero)
        .filter((n) => n !== undefined && n !== null && n !== ''))];
    if (numeros.length === 1) return `Tu abono a capital — crédito ${idVm}, cuota ${numeros[0]}`;
    if (numeros.length > 1) return `Tu abono a capital — crédito ${idVm}, cuotas ${numeros.join(' y ')}`;
    return `Tu abono a capital — crédito ${idVm}`;
}

/** Las cifras que resumen el informe, para la tarjeta de la lista y el aviso. */
function resumenDelInforme(plan) {
    const r = plan.resumen || {};
    return {
        // Lo de ESTE abono. Hubo un tiempo en que aquí iba el acumulado del
        // crédito y la tarjeta decía "abonaste $510.220" sobre un pago de $288.887.
        excedente: Math.round(num(r.excedente)),
        acumulado: Math.round(num(r.excedenteAcumulado !== undefined ? r.excedenteAcumulado : r.excedente)),
        ahorroInteres: Math.round(num(r.ahorroInteres)),
        bajaMensual: Math.round(bajaMensualDe(cambiosDe(plan))),
    };
}

/**
 * Construye el informe. `plan` es lo que devuelve planificarPrestamo, con los
 * cambios ya calculados (antes/después de cada cuota).
 *
 * ── UNA SOLA CLASE DE CIFRA ─────────────────────────────────────────────────
 *
 * Todo lo que dice este documento es de ESTE abono: lo que se pagó de más en
 * esta ocasión, lo que bajan las cuotas por él y los intereses que él ahorra.
 * Lo que el socio lleva abonado en todo el crédito aparece una sola vez, en su
 * propia línea y con ese nombre. La primera versión ponía el acumulado donde
 * iba el abono, y el resultado era un documento que se contradecía solo: decía
 * "$510.220 abonado + $22.244 de intereses = $311.131 menos por pagar".
 *
 * ── LA COMPROBACIÓN TIENE QUE CERRAR ────────────────────────────────────────
 *
 * Lo que baja el total por pagar es: lo abonado, más el interés ya cobrado que
 * se reconoce como capital (cuando el abono se aplicó después de haber pagado
 * otras cuotas), más los intereses que dejan de causarse, menos lo que sobre si
 * el pago superó la deuda. Si con las cifras del plan esa cuenta no cierra, la
 * igualdad no se imprime: es preferible un informe sin esa línea a uno que
 * afirme una suma falsa.
 */
function construirMarkdown({ plan, socio, idVm, fecha = new Date() }) {
    const r = plan.resumen || {};
    const cambios = cambiosDe(plan);

    // En la tabla van solo las cuotas cuyo valor cambia. La abonada y las que
    // se pagaron después también pueden figurar en el plan —se les corrige el
    // saldo o el reparto entre interés y capital—, pero su valor no se mueve y
    // listarlas con un guion no le dice nada a quien las pagó.
    const enTabla = cambios.filter((c) => c.cancelar || Math.abs(bajaDe(c)) > 0.5);
    const bajaMensual = bajaMensualDe(cambios);

    const totalAntes = enTabla.reduce((s, c) => s + num(c.antes.valorCuotaVariable), 0);
    const totalDespues = enTabla.reduce((s, c) => s + num(c.despues.valorCuotaVariable), 0);
    const baja = totalAntes - totalDespues;

    const filas = enTabla.map((c) => {
        const antes = num(c.antes.valorCuotaVariable);
        const despues = num(c.despues.valorCuotaVariable);
        const etiqueta = c.cancelar ? '**cancelada**' : `−${pesos(antes - despues)}`;
        return `| ${c.itemQuantity ?? c.cuota} | ${c.cuota} | ${pesos(antes)} | ${pesos(despues)} | ${etiqueta} | ${pesos(c.despues.saldoFinal)} |`;
    }).join('\n');

    const nombre = [socio?.name, socio?.surname1].filter(Boolean).join(' ').trim() || 'Socio';

    const abonado = num(r.excedente);
    const acumulado = num(r.excedenteAcumulado !== undefined ? r.excedenteAcumulado : r.excedente);
    const reconocido = num(r.interesReintegrado);
    const ahorro = num(r.ahorroInteres);
    const sobrante = num(r.sobrante);

    // ── Qué se pagó y cuánto valía la cuota ──────────────────────────────
    // Es lo que el socio reconoce de su propio pago. Solo se detalla cuando
    // las cuotas explican exactamente lo aplicado; si no, se dice el importe.
    const abonos = (plan.abonos || []).filter((a) => num(a.excedente) > 0);
    const conDetalle = abonos.length > 0
        && Math.abs(abonos.reduce((s, a) => s + num(a.excedente), 0) - abonado) <= 1;
    const cuotaDe = (a) => (a.numero !== undefined && a.numero !== null && a.numero !== ''
        ? `cuota ${a.numero} (${a.cuota})` : `cuota ${a.cuota}`);
    let entrada;
    if (conDetalle && abonos.length === 1) {
        const a = abonos[0];
        entrada = `En tu ${cuotaDe(a)} pagaste **${pesos(a.pagado)}** y la cuota era de **${pesos(a.valorCuota)}**:\n`
            + `son **${pesos(abonado)}** por encima.`;
    } else if (conDetalle) {
        entrada = `Pagaste **${pesos(abonado)}** por encima de tus cuotas: `
            + `${abonos.map((a) => `${pesos(a.excedente)} en la ${cuotaDe(a)}`).join(' y ')}.`;
    } else {
        entrada = `Pagaste **${pesos(abonado)}** por encima de tu cuota.`;
    }

    const resumen = [
        `| Abonaste a capital con este pago | **${pesos(abonado)}** |`,
        `| Tu cuota bajó | **${pesos(bajaMensual)}** cada mes |`,
        `| Te ahorraste en intereses | **${pesos(ahorro)}** |`,
        reconocido >= 1 ? `| Intereses ya pagados que se te reconocen como capital | **${pesos(reconocido)}** |` : null,
        sobrante >= 1 ? `| A tu favor, por devolver | **${pesos(sobrante)}** |` : null,
        acumulado - abonado > 1 ? `| Con este, llevas abonado a capital en el crédito | **${pesos(acumulado)}** |` : null,
    ].filter(Boolean).join('\n');

    // ── La comprobación ──────────────────────────────────────────────────
    const cierra = Math.abs(abonado + reconocido + ahorro - sobrante - baja) <= 2;
    if (!cierra) {
        console.warn(`[INFORME] ${idVm}: la comprobación no cierra `
            + `(${abonado} + ${reconocido} + ${ahorro} − ${sobrante} ≠ ${baja}); el informe sale sin la igualdad.`);
    }
    const sencilla = reconocido < 1 && sobrante < 1;
    const terminos = [
        `${pesos(abonado)} abonado a capital`,
        reconocido >= 1 ? `${pesos(reconocido)} de intereses reconocidos como capital` : null,
        `${pesos(ahorro)} de intereses ahorrados`,
    ].filter(Boolean).join(' + ') + (sobrante >= 1 ? ` − ${pesos(sobrante)} a tu favor` : '');
    const alPeso = Math.round(abonado) + Math.round(reconocido) + Math.round(ahorro) - Math.round(sobrante) === Math.round(baja);

    let comprobacion;
    if (sencilla) {
        comprobacion = `Abonaste **${pesos(abonado)}** a capital y lo que te quedaba por pagar bajó
**${pesos(baja)}**. La diferencia entre las dos cifras,
**${pesos(ahorro)}**, son los intereses que ya no vas a pagar: al bajar
el saldo, cada mes se te cobra interés sobre una deuda menor.`;
    } else {
        comprobacion = [
            `Lo que te quedaba por pagar bajó **${pesos(baja)}**. Se compone así:`,
            '',
            `- **${pesos(abonado)}** que abonaste a capital.`,
            reconocido >= 1
                ? `- **${pesos(reconocido)}** de intereses que ya habías pagado sobre ese capital en cuotas posteriores, y que se te reconocen como abono.`
                : null,
            `- **${pesos(ahorro)}** de intereses que ya no vas a pagar: al bajar el saldo, cada mes se te cobra interés sobre una deuda menor.`,
            sobrante >= 1
                ? `- Menos **${pesos(sobrante)}** que pagaste por encima de toda tu deuda: quedan a tu favor y el fondo te los devuelve.`
                : null,
        ].filter((l) => l !== null).join('\n');
    }
    if (cierra) {
        comprobacion += `\n\n> ${terminos} = ${pesos(baja)} menos por pagar`;
        if (!alPeso) comprobacion += '\n\n*Las cifras van redondeadas al peso; por eso la suma puede diferir en un peso.*';
    }

    return `# ${tituloDe(idVm, plan)}

**${nombre}** · ${enLetras(fecha)}

${entrada} Ese dinero no se perdió
ni quedó a favor del fondo: **abonó directamente a capital** y se usó para
**bajar el valor de tus cuotas siguientes**. Aquí está cómo quedaron.

## En resumen

| | |
|---|---|
${resumen}

## Tus cuotas, antes y ahora

El *saldo después* es lo que te queda por pagar de capital una vez abonada esa cuota.

| Cuota | ID_EP | Antes | Ahora | Baja | Saldo después |
|---|---|---|---|---|---|
${filas}
| | **TOTAL** | **${pesos(totalAntes)}** | **${pesos(totalDespues)}** | **−${pesos(baja)}** | |

## Cómo se comprueba

${comprobacion}

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
 *
 * `nombre` permite reescribir uno que ya existe —corregirlo— sin cambiarle el
 * nombre, que es a donde apunta el aviso que el socio ya recibió.
 */
function guardarInforme({ dir, plan, socio, idVm, fecha = new Date(), nombre = null }) {
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const primera = ((plan && plan.abonos) || [])[0];
        const destino = nombre || nombreArchivo(idVm, fecha, primera ? primera.numero : null);
        fs.writeFileSync(path.join(dir, destino), construirMarkdown({ plan, socio, idVm, fecha }), 'utf-8');
        return destino;
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
    // Uno retirado no cuenta como "ya estaba": si el abono se vuelve a aplicar
    // el mismo día, el informe sale con el mismo nombre y para el socio es
    // noticia otra vez — lo último que supo es que ese abono se había revertido.
    const yaEstaba = Boolean(registro[nombre]) && !registro[nombre].retiradoEl;
    registro[nombre] = { ...datos, generadoEl: datos.generadoEl || new Date().toISOString() };
    await AppSetting.upsert({ key: CLAVE_INFORMES_SOCIO, value: JSON.stringify(registro) });

    // Solo la primera vez, y solo si sabemos a quién. El aviso no puede tumbar
    // el registro: el informe ya está publicado y eso es lo que importa.
    if (notificar && !yaEstaba) await avisarInformeNuevo(nombre, registro[nombre]);
    return registro;
}

/** A dónde lleva el aviso: directo al documento, no al listado. */
const enlaceDeInforme = (nombre) => `/dashboard/informes/${encodeURIComponent(nombre)}`;

/** Lo que dice la campana de un informe: su título y las dos cifras que importan. */
function mensajeDeInforme(nombre, datos) {
    const r = (datos && datos.resumen) || {};
    const detalle = r.bajaMensual > 0
        ? `Tu cuota bajó ${pesos(r.bajaMensual)} cada mes y te ahorraste ${pesos(r.ahorroInteres)} en intereses.`
        : 'Ábrelo para ver el detalle.';
    return `${(datos && datos.titulo) || nombre}. ${detalle}`;
}

/**
 * La campana de "tienes un informe nuevo". Nunca lanza; devuelve si avisó.
 *
 * Cuando la cédula del registro no es de ningún socio, lo DICE. Antes callaba,
 * y así pasó semanas sin verse que el informe sembrado de una socia estaba a
 * nombre de una cédula con un dígito cambiado: ella no lo tenía en su menú, no
 * recibió el aviso, y en el arranque todo figuraba como "ya publicado".
 */
async function avisarInformeNuevo(nombre, datos) {
    if (!datos || !datos.cedula) return false;
    try {
        const Client = require('../models/Client');
        const { createNotification } = require('./NotificationService');
        const socio = await Client.findOne({ where: { cedula: String(datos.cedula) } });
        if (!socio) {
            console.warn(`[INFORME] ${nombre} está a nombre de la cédula ${datos.cedula}, que no es de ningún socio: nadie lo ve en su menú ni recibe el aviso.`);
            return false;
        }
        await createNotification({
            clientId: socio.id,
            type: 'informe',
            title: 'Tienes un informe nuevo',
            message: mensajeDeInforme(nombre, datos),
            // Lleva directo al documento, no al listado: el aviso dice que
            // hay algo que leer, así que el clic tiene que abrirlo.
            link: enlaceDeInforme(nombre),
        });
        return true;
    } catch (err) {
        console.warn('[INFORME] Registrado, pero no se pudo avisar al socio:', err.message);
        return false;
    }
}

/**
 * Escribe el informe y lo deja registrado a nombre del socio. Nunca lanza.
 *
 * Con `nombre` reescribe uno existente en vez de crear otro, y con
 * `notificar: false` no vuelve a sonar la campana: es como se corrige un
 * informe que ya se entregó.
 */
async function publicarInforme({ plan, socio, idVm, fecha = new Date(), nombre = null, notificar = true, generadoEl = null }) {
    try {
        const publicado = guardarInforme({ dir: INFORMES_SOCIO_DIR, plan, socio, idVm, fecha, nombre });
        if (!publicado || !socio) return null;
        await registrarInformeSocio(publicado, {
            cedula: socio.cedula,
            socio: [socio.name, socio.surname1].filter(Boolean).join(' ').trim(),
            titulo: tituloDe(idVm, plan),
            idVm,
            // Con esto la lista puede decir "tu cuota bajó $23.220 al mes" sin
            // abrir el archivo. Un listado de nombres no le dice nada a nadie.
            resumen: resumenDelInforme(plan),
            ...(generadoEl ? { generadoEl } : {}),
        }, { notificar });
        return publicado;
    } catch (err) {
        console.warn('[INFORME] No se pudo publicar el informe del abono:', err.message);
        return null;
    }
}

/**
 * Retira los informes que explicaban un abono que ya no está aplicado.
 *
 * Un informe que sigue en el menú del socio diciendo "tu cuota bajó $23.220"
 * después de revertir el abono es un documento del fondo afirmando algo que
 * dejó de ser cierto. Se retira de su vista.
 *
 * Retirar NO es borrar: el archivo se queda donde está y la entrada sigue en el
 * registro, marcada. Es lo que el fondo le dijo a esa persona en su momento, y
 * eso tiene que poder consultarse — el gerente y la Junta lo siguen viendo. Hay
 * además una razón práctica: si la entrada desapareciera, la siembra del
 * informe de Gimena la volvería a crear en el siguiente arranque y le avisaría
 * de un "informe nuevo" sobre un abono revertido.
 *
 * Se busca por el nombre que el reajuste dejó anotado y, para los reajustes
 * anteriores a esa anotación, por las cifras: mismo crédito y mismo abonado.
 * Los informes más antiguos guardaron como abonado el acumulado del crédito, y
 * por eso a esos —los que no traen `acumulado` aparte— se les compara también
 * con él.
 */
async function retirarInformesDeAbono({ idVm, excedente, acumulado = null, nombre = null }) {
    const AppSetting = require('../models/AppSetting');
    const registro = await leerRegistroInformes();
    const abonado = Math.round(num(excedente));
    const total = Math.round(num(acumulado));
    const retirados = [];
    for (const [clave, meta] of Object.entries(registro)) {
        if (!meta || meta.retiradoEl) continue;
        const cifra = Number(meta.resumen?.excedente);
        const antiguo = meta.resumen && meta.resumen.acumulado === undefined;
        const porCifras = meta.idVm === idVm && cifra > 0
            && (cifra === abonado || (antiguo && total > 0 && cifra === total));
        if (clave !== nombre && !porCifras) continue;
        registro[clave] = {
            ...meta,
            retiradoEl: new Date().toISOString(),
            motivoRetiro: 'El abono a capital que explicaba fue revertido.',
        };
        retirados.push(clave);
    }
    if (retirados.length > 0) {
        await AppSetting.upsert({ key: CLAVE_INFORMES_SOCIO, value: JSON.stringify(registro) });
    }
    return retirados;
}

/** Quién debe un crédito: la única persona a cuyo nombre puede ir su informe. */
async function duenoDelPrestamo(idVm) {
    const DisbursedLoan = require('../models/DisbursedLoan');
    const Client = require('../models/Client');
    const prestamo = await DisbursedLoan.findOne({ where: { idVm }, attributes: ['clientId'] });
    if (!prestamo || !prestamo.clientId) return null;
    return Client.findByPk(prestamo.clientId);
}

/**
 * El informe de Gimena, que ya existía antes de que esto se automatizara.
 *
 * Se generó a mano al investigar su caso y quedó en `Informes/` del repositorio,
 * visible solo para el gerente. Registrarlo aquí lo pone donde tiene que estar:
 * en el menú de ella. Corre una sola vez: si la clave ya lo tiene, no se toca.
 *
 * La dueña se busca por el crédito, no por una cédula escrita aquí. La primera
 * versión la llevaba escrita y con un dígito cambiado (terminaba en 0 y es 7):
 * el informe quedó a nombre de nadie. `repararDuenosDeInformes` corrige ese
 * registro donde ya existe; esto evita repetirlo en una base nueva.
 */
async function sembrarInformeGimena() {
    const registro = await leerRegistroInformes();
    const NOMBRE = 'Abono_SOL30_Gimena_Tascon.pdf';
    if (registro[NOMBRE]) return { sembrado: false, yaEstaba: true, deQuien: registro[NOMBRE].cedula };
    const duena = await duenoDelPrestamo('SOL30');
    // Sin el crédito no hay a quién entregárselo (una base de pruebas, por ejemplo).
    if (!duena || !duena.cedula) return { sembrado: false, sinPrestamo: true };
    await registrarInformeSocio(NOMBRE, {
        cedula: String(duena.cedula),
        socio: [duena.name, duena.surname1].filter(Boolean).join(' ').trim(),
        titulo: 'Tu abono a capital — crédito SOL30, cuota 1',
        idVm: 'SOL30',
        generadoEl: '2026-09-16T00:00:00.000Z',
        resumen: { excedente: 221333, acumulado: 221333, ahorroInteres: 18592, bajaMensual: 23220 },
    });
    return { sembrado: true, nombre: NOMBRE };
}

/**
 * Cada informe personal tiene que estar a nombre de quien debe el crédito que
 * explica. Corrige los que no lo están y le avisa a su dueña si nunca se le
 * avisó.
 *
 * Existe por un caso real: el informe del primer abono de una socia se registró
 * con su cédula mal escrita. El listado decide de quién es un documento
 * comparando esa cédula con la de quien entra, así que ella no lo veía; y el
 * aviso se busca por la misma cédula, así que tampoco le llegó.
 *
 * La dueña sale del préstamo (`idVm`), que es el dato que no admite
 * interpretación. Que el aviso falte se comprueba mirando si ya existe uno que
 * lleve a ese documento: correr esto dos veces no suena dos veces. Con
 * `avisar: false` solo corrige a nombre de quién está.
 */
async function repararDuenosDeInformes({ avisar = true } = {}) {
    const AppSetting = require('../models/AppSetting');
    const Notification = require('../models/Notification');
    const registro = await leerRegistroInformes();
    const corregidos = [];

    for (const [nombre, meta] of Object.entries(registro)) {
        if (!meta || !meta.idVm) continue;
        const duena = await duenoDelPrestamo(meta.idVm);
        if (!duena || !duena.cedula || String(duena.cedula) === String(meta.cedula || '')) continue;
        registro[nombre] = { ...meta, cedula: String(duena.cedula), cedulaAnterior: meta.cedula || null };
        corregidos.push({ nombre, antes: meta.cedula || null, ahora: String(duena.cedula), clientId: duena.id, avisado: false });
    }
    if (corregidos.length === 0) return corregidos;

    await AppSetting.upsert({ key: CLAVE_INFORMES_SOCIO, value: JSON.stringify(registro) });
    for (const c of corregidos) {
        if (!avisar || registro[c.nombre].retiradoEl) continue;
        const yaAvisado = await Notification.count({ where: { clientId: c.clientId, link: enlaceDeInforme(c.nombre) } });
        if (yaAvisado === 0) c.avisado = await avisarInformeNuevo(c.nombre, registro[c.nombre]);
    }
    return corregidos;
}

module.exports = {
    sembrarInformeGimena, repararDuenosDeInformes, duenoDelPrestamo,
    construirMarkdown, resumenDelInforme, guardarInforme, nombreArchivo, publicarInforme,
    tituloDe, diaBogota, enlaceDeInforme, mensajeDeInforme,
    INFORMES_SOCIO_DIR, CLAVE_INFORMES_SOCIO, leerRegistroInformes, registrarInformeSocio,
    retirarInformesDeAbono,
};
