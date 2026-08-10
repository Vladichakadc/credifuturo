import {
    LayoutDashboard, Landmark, Activity, BarChart3, PiggyBank, TrendingUp,
    HandCoins, CreditCard, Scale, Calculator, Lightbulb, Trophy, Gavel,
    ScrollText, FileText, Users, Wallet, Receipt, ShieldCheck, SlidersHorizontal,
    ClipboardList, Undo2, LinkIcon, FolderOpen,
} from 'lucide-react';

/**
 * Catálogo de la presentación de cada menú: qué es esta página y qué se
 * encuentra dentro.
 *
 * Existe porque cada pantalla explicaba (o no explicaba) su propósito a su
 * manera: unas abrían con un encabezado propio, otras con una tabla sin más, y
 * un socio que entraba por primera vez no tenía forma de saber qué estaba
 * mirando. Con un catálogo único, la presentación se escribe una vez, se ve
 * igual en todas y añadir una pantalla nueva es agregar una entrada aquí.
 *
 * Se pinta desde los DOS layouts (DashboardLayout y UserDashboardLayout) según
 * la ruta activa, no desde cada página: así una pantalla nueva la hereda sin
 * tocarla, y no hay treinta copias del mismo bloque que mantener sincronizadas.
 *
 * Es SOLO informativo por decisión de diseño: ni botones ni cifras. Los botones
 * pertenecen a la barra de acciones de cada página, junto al contenido sobre el
 * que actúan, y las cifras a las tarjetas del cuerpo. Un encabezado que además
 * hace cosas deja de leerse como presentación.
 *
 * Las claves son la ruta EXACTA (location.pathname). Una ruta sin entrada
 * simplemente no muestra encabezado — es preferible a inventar una descripción
 * genérica que no le diga nada a nadie.
 */

export const PAGINAS_INFO = {
    // ── Socio ────────────────────────────────────────────────────────────
    '/dashboard': {
        icono: LayoutDashboard,
        titulo: 'Mi Panel',
        descripcion: 'Tu resumen personal como socio de Credifuturo: cuánto has construido, qué te toca pagar y de cuánto crédito dispones.',
        encontraras: [
            'Tu patrimonio en el fondo y cómo ha crecido mes a mes',
            'La próxima cuota que vence y tu racha de ahorro',
            'Tu capacidad de crédito y el estado de tus préstamos',
        ],
    },
    '/dashboard/fondo': {
        icono: Landmark,
        titulo: 'Nuestro Fondo',
        descripcion: 'El panel completo del fondo: cómo se compone el patrimonio de todos los socios y en qué está puesto el dinero.',
        encontraras: [
            'Capital ahorrado, cartera colocada y caja disponible',
            'Indicadores de la operación por área',
            'Comparativos del año en curso frente a los anteriores',
        ],
    },
    '/dashboard/panel-ejecutivo': {
        icono: Activity,
        titulo: 'Panel Ejecutivo',
        descripcion: 'La lectura de dirección del fondo: los indicadores que la Junta revisa para decidir.',
        encontraras: [
            'Veredicto del estado del fondo y detalle completo',
            'Concentración de la cartera y relación préstamos/patrimonio',
            'Tu posición personal dentro del fondo',
        ],
    },
    '/dashboard/inteligencia-financiera': {
        icono: BarChart3,
        titulo: 'Inteligencia Financiera',
        descripcion: 'El análisis del fondo: cómo va el año frente a los anteriores y qué dicen los números.',
        encontraras: [
            'Indicadores de riesgo y rendimiento de la cartera',
            'Comparador interanual por indicador y resultados del año',
            'Diagnóstico financiero y movimiento mensual del fondo',
        ],
    },
    '/dashboard/cuenta': {
        icono: PiggyBank,
        titulo: 'Mi Cuenta de Ahorros',
        descripcion: 'El detalle de tu ahorro en el fondo, mes a mes, desde que entraste.',
        encontraras: [
            'Cada abono registrado con el mes que cubre',
            'Tu saldo acreditado y los recargos aplicados',
            'La evolución de tu ahorro a lo largo del tiempo',
        ],
    },
    '/dashboard/savings-evolution': {
        icono: TrendingUp,
        titulo: 'Evolución de Ahorros',
        descripcion: 'Cómo ha crecido el ahorro en el tiempo: el stock acumulado, el flujo de cada mes y de qué se compone.',
        encontraras: [
            'Tu evolución acumulada mes a mes',
            'Composición del patrimonio entre aportes y ahorro recurrente',
        ],
    },
    '/dashboard/contributions': {
        icono: HandCoins,
        titulo: 'Mis Aportes',
        descripcion: 'Los aportes iniciales con los que entraste al fondo, separados del ahorro mensual.',
        encontraras: [
            'Cada aporte con su fecha y su valor',
            'El total aportado y su peso dentro de tu patrimonio',
        ],
    },
    '/dashboard/mis-creditos': {
        icono: CreditCard,
        titulo: 'Mis Créditos',
        descripcion: 'Tus préstamos con el fondo y el estado de cada cuota, en un solo lugar.',
        encontraras: [
            'Los préstamos que te han desembolsado y su saldo pendiente',
            'El estado de cada cuota: pagada, pendiente o en mora',
            'El costo financiero de tus créditos y la exportación a Excel',
        ],
    },
    '/dashboard/loan-capacity': {
        icono: Scale,
        titulo: 'Analizador de Capacidad',
        descripcion: 'Cuánto crédito puedes pedir hoy según tu ahorro y tu historial de pago.',
        encontraras: [
            'Tu puntaje de crédito y qué lo compone',
            'El cupo disponible y la regla que lo determina',
            'Qué mejorar para ampliarlo',
        ],
    },
    '/dashboard/loan-capacity-beta': {
        icono: Scale,
        titulo: 'Capacidad de Crédito',
        descripcion: 'Cuánto crédito puedes pedir hoy según tu ahorro y tu historial de pago.',
        encontraras: [
            'Tu puntaje de crédito y su evolución',
            'El cupo disponible y cómo se calcula',
        ],
    },
    '/dashboard/simulador': {
        icono: Calculator,
        titulo: 'Simulador de Préstamo',
        descripcion: 'Calcula la cuota antes de pedir: cuánto pagarías al mes y cuánto costaría en intereses.',
        encontraras: [
            'Cuota mensual según monto, plazo y tasa',
            'El total de intereses sobre la vida del crédito',
        ],
    },
    '/dashboard/account-details': {
        icono: Wallet,
        titulo: 'Detalle de la Cuenta',
        descripcion: 'Todo tu movimiento con el fondo reunido: ahorros, aportes y pagos.',
        encontraras: [
            'El detalle de cada ahorro y cada aporte',
            'Tu capital acumulado y su composición',
            'La descarga del extracto en PDF',
        ],
    },
    '/dashboard/propuestas': {
        icono: Lightbulb,
        titulo: 'Buzón de Propuestas',
        descripcion: 'El espacio para proponer mejoras al fondo y votar las de los demás socios.',
        encontraras: [
            'Las propuestas abiertas y su estado',
            'Tu voto sobre cada una',
        ],
    },
    '/dashboard/ranking-ahorro': {
        icono: Trophy,
        titulo: 'Ranking de Ahorro',
        descripcion: 'Cómo va el ahorro de los socios en el año, ordenado por lo acumulado.',
        encontraras: [
            'El acumulado por socio en el período',
            'Tu posición dentro del grupo',
        ],
    },
    '/dashboard/junta-prestamos': {
        icono: Gavel,
        titulo: 'Aprobación de Préstamos',
        descripcion: 'Las solicitudes de crédito que esperan el voto de la Junta Administrativa.',
        encontraras: [
            'Cada solicitud con el puntaje y la capacidad del socio',
            'El voto de cada miembro de la Junta',
            'La aprobación requiere unanimidad',
        ],
    },
    '/dashboard/statutes': {
        icono: ScrollText,
        titulo: 'Estatutos Generales',
        descripcion: 'Las reglas que rigen el fondo y la relación entre los socios.',
        encontraras: ['El texto vigente de los estatutos'],
    },
    '/dashboard/resolutions': {
        icono: FileText,
        titulo: 'Resoluciones',
        descripcion: 'Las decisiones aprobadas por la Junta que complementan los estatutos.',
        encontraras: ['Cada resolución con su número y su alcance'],
    },

    // ── Administración ───────────────────────────────────────────────────
    '/admin': {
        icono: LayoutDashboard,
        titulo: 'Panel de Administración',
        descripcion: 'La vista operativa del fondo: el estado de cada área y los accesos a su gestión.',
        encontraras: [
            'Indicadores de socios, ahorros, cartera y pagos',
            'Análisis del año en curso frente a los anteriores',
            'Los accesos a cada módulo de gestión',
        ],
    },
    '/admin/clients/list': {
        icono: Users,
        titulo: 'Socios',
        descripcion: 'El registro de socios del fondo y la gestión de sus datos.',
        encontraras: [
            'La lista completa con filtros por estado y cargo',
            'La ficha de cada socio con su historial',
            'Alta, edición y cambio de estado',
        ],
    },
    '/admin/loans/list': {
        icono: CreditCard,
        titulo: 'Préstamos',
        descripcion: 'Los créditos desembolsados por el fondo y su estado de recuperación.',
        encontraras: [
            'Cada préstamo con su saldo y sus cuotas',
            'Filtros por estado y año de desembolso',
            'El registro de nuevos desembolsos',
        ],
    },
    '/admin/loans/approvals': {
        icono: Gavel,
        titulo: 'Aprobación de Préstamos',
        descripcion: 'Las solicitudes que esperan el voto de la Junta Administrativa.',
        encontraras: [
            'Cada solicitud con el puntaje y la capacidad del socio',
            'El voto de cada miembro y el resultado agregado',
        ],
    },
    '/admin/loans/orphans': {
        icono: LinkIcon,
        titulo: 'Préstamos sin Vincular',
        descripcion: 'Créditos cuyas cuotas no encuentran un préstamo asociado, para revisarlos y corregirlos.',
        encontraras: ['Las inconsistencias detectadas entre cuotas y préstamos'],
    },
    '/admin/savings/list': {
        icono: PiggyBank,
        titulo: 'Ahorros',
        descripcion: 'El registro de ahorros de todos los socios, mes a mes.',
        encontraras: [
            'Cada abono con el mes que cubre y el recargo aplicado',
            'Filtros por socio, período y estado',
        ],
    },
    '/admin/savings/summary': {
        icono: BarChart3,
        titulo: 'Resumen de Ahorros',
        descripcion: 'La lectura agregada del ahorro del fondo por período.',
        encontraras: ['Totales por mes y por año', 'La tendencia del ahorro en el tiempo'],
    },
    '/admin/savings/ranking': {
        icono: Trophy,
        titulo: 'Ranking de Ahorro',
        descripcion: 'El ahorro acumulado por socio en el período, ordenado de mayor a menor.',
        encontraras: ['El acumulado neto por socio', 'La distribución del ahorro entre los socios'],
    },
    '/admin/savings/evolution': {
        icono: TrendingUp,
        titulo: 'Evolución de Ahorros',
        descripcion: 'Cómo ha crecido el ahorro en el tiempo: stock, flujo mensual y composición.',
        encontraras: [
            'La evolución acumulada del fondo o de un socio',
            'Composición entre aportes iniciales y ahorro recurrente',
        ],
    },
    '/admin/savings/devoluciones': {
        icono: Undo2,
        titulo: 'Devoluciones de Ahorros',
        descripcion: 'Los retiros de ahorro entregados a socios que dejaron el fondo.',
        encontraras: ['Cada devolución con su fecha y su valor'],
    },
    '/admin/initial-contributions/list': {
        icono: HandCoins,
        titulo: 'Aportes Iniciales',
        descripcion: 'Los aportes con los que cada socio entró al fondo, separados del ahorro mensual.',
        encontraras: ['Cada aporte con su fecha y su socio', 'El registro de nuevos aportes'],
    },
    '/admin/payments/list': {
        icono: Receipt,
        titulo: 'Control de Pagos',
        descripcion: 'Las cuotas de todos los créditos y su estado de pago.',
        encontraras: [
            'Cada cuota con su vencimiento y su estado',
            'La gestión de mora y el registro de pagos',
            'Los soportes de pago cargados por los socios',
        ],
    },
    '/admin/reports': {
        icono: ClipboardList,
        titulo: 'Reportes',
        descripcion: 'Las descargas y respaldos de la información del fondo.',
        encontraras: ['La exportación de cada tabla a Excel', 'El respaldo de la base de datos'],
    },
    '/admin/account-detail': {
        icono: Wallet,
        titulo: 'Detalle de Cuenta',
        descripcion: 'El movimiento completo de un socio: ahorros, aportes y pagos.',
        encontraras: ['El detalle por socio con su capital acumulado'],
    },
    '/admin/logs': {
        icono: ShieldCheck,
        titulo: 'Registros de Acceso',
        descripcion: 'Quién entra al sistema y los eventos de seguridad detectados.',
        encontraras: [
            'La última conexión de cada socio',
            'Los intentos de acceso fallidos y alertas de fuerza bruta',
        ],
    },
    '/admin/cambios': {
        icono: SlidersHorizontal,
        titulo: 'Cambios',
        descripcion: 'El control de qué secciones ven los socios. Cada decisión es reversible con un clic, sin pasar por desarrollo.',
        encontraras: [
            'Cada sección ocultable con su interruptor',
            'La vista previa de cómo se vería antes de decidir',
        ],
    },
    '/admin/propuestas': {
        icono: Lightbulb,
        titulo: 'Buzón de Propuestas',
        descripcion: 'Las propuestas de mejora enviadas por los socios y su votación.',
        encontraras: ['Cada propuesta con sus votos', 'El cambio de estado de cada una'],
    },
    '/admin/informes': {
        icono: FolderOpen,
        titulo: 'Informes',
        descripcion: 'Los informes compartidos con la Junta Administrativa.',
        encontraras: ['Los documentos publicados y su lectura en el navegador'],
    },
};

/** Devuelve la ficha de una ruta, o `null` si esa pantalla no tiene presentación. */
export function infoDePagina(pathname) {
    if (!pathname) return null;
    // Se normaliza la barra final para que '/admin/' y '/admin' resuelvan igual.
    const limpia = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return PAGINAS_INFO[limpia] || null;
}
