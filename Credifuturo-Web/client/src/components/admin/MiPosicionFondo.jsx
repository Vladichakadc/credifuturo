import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiggyBank, Coins, TrendingUp, Gauge, ChevronRight, Info } from 'lucide-react';
import api from '../../config/api';
import { calcVerdict } from '../../utils/loanCapacity';

/**
 * "Mi posición en el fondo" — el puente entre el panel agregado y el socio.
 *
 * El Panel Ejecutivo responde muy bien "¿cómo está el fondo?" pero no respondía
 * ninguna de las tres preguntas con las que el socio realmente entra: cuánto
 * tengo ahorrado, cuánto me tocaría de las utilidades, cuánto puedo pedir
 * prestado. Sin ellas, las cifras del fondo son un informe ajeno; con ellas, el
 * socio entiende qué significan *para él* y puede decidir con criterio.
 *
 * Solo se muestra a socios (no al gerente, que no consulta su propia posición
 * desde aquí). Ambos endpoints son `/my/*`: devuelven exclusivamente los datos
 * del solicitante (`req.user.id`), nunca los de terceros.
 *
 * El cupo NO se recalcula aquí: se delega en `calcVerdict()` de
 * utils/loanCapacity.js, que es la fuente única de la regla 3× y del score. Si
 * el comité cambia el factor, esta tarjeta cambia con él sin tocarla.
 */

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const Tarjeta = ({ icon: Icon, etiqueta, valor, sub, nota, tono = 'verde', onClick }) => {
    const tonos = {
        verde: { valor: 'text-brand-primary', icono: 'text-brand-primary', borde: 'hover:border-brand-primary/30' },
        dorado: { valor: 'text-amber-600', icono: 'text-amber-500', borde: 'hover:border-amber-300' },
        rojo: { valor: 'text-red-600', icono: 'text-red-500', borde: 'hover:border-red-300' },
        gris: { valor: 'text-gray-900', icono: 'text-gray-400', borde: 'hover:border-gray-300' },
    };
    const t = tonos[tono] || tonos.verde;
    const Comp = onClick ? 'button' : 'div';
    return (
        <Comp
            onClick={onClick}
            className={`relative bg-white rounded-xl border border-gray-200 shadow-card p-4 text-left w-full transition-all duration-200 ${onClick ? `cursor-pointer hover:shadow-md ${t.borde} active:scale-[0.98]` : ''}`}
        >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${t.icono}`} />
                {etiqueta}
            </p>
            <p className={`text-xl font-extrabold mt-1.5 tabular-nums ${t.valor}`}>{valor}</p>
            {sub && <p className="text-[11px] text-gray-600 font-semibold mt-0.5 leading-snug">{sub}</p>}
            {nota && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{nota}</p>}
            {onClick && <ChevronRight className="h-3.5 w-3.5 text-gray-300 absolute bottom-3 right-3" />}
        </Comp>
    );
};

const Esqueleto = () => (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-2.5 bg-gray-200 rounded w-2/3" />
                <div className="h-5 bg-gray-200 rounded w-4/5 mt-3" />
                <div className="h-2 bg-gray-100 rounded w-full mt-3" />
            </div>
        ))}
    </div>
);

const MiPosicionFondo = ({ nombre }) => {
    const navigate = useNavigate();
    const [capacidad, setCapacidad] = useState(null);
    const [utilidades, setUtilidades] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState(false);

    useEffect(() => {
        let vivo = true;
        (async () => {
            const r = await Promise.allSettled([
                api.get('/admin/my/loan-capacity'),
                api.get('/admin/my/utilidades-estimadas'),
            ]);
            if (!vivo) return;
            if (r[0].status === 'fulfilled') setCapacidad(r[0].value.data);
            else setFallo(true);
            // `data: null` es una respuesta válida: significa que aún no hay
            // utilidades o base de reparto en el año. No es un error.
            if (r[1].status === 'fulfilled') setUtilidades(r[1].value.data?.data || null);
            setCargando(false);
        })();
        return () => { vivo = false; };
    }, []);

    if (cargando) return <Esqueleto />;
    if (fallo || !capacidad) {
        return (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                <Info className="h-4 w-4 flex-shrink-0 text-gray-400" />
                No fue posible cargar tu posición personal en este momento. Los indicadores del fondo que ves abajo no se ven afectados.
            </div>
        );
    }

    // El cupo y el score se delegan en la fuente única. Si esa función tropieza con
    // un perfil con datos incompletos, el fallo debe quedarse en esta tarjeta y no
    // tumbar el panel entero del fondo, que es información de todos.
    let v = null;
    try { v = calcVerdict(capacidad, { audience: 'user' }); }
    catch { v = null; }
    const cupoLibre = Math.max(0, v?.capacidadDisponible ?? 0);
    const score = v?.score;
    const deuda = capacidad.totalDeudaPendiente || 0;
    const primerNombre = (nombre || '').trim().split(' ')[0];

    // Sin aporte inicial la frase "$0 de aporte inicial" es ruido: se dice solo
    // lo que el socio tiene. Y sin deuda, repetir el techo 3× al lado de un cupo
    // idéntico se lee como un error de cálculo — mejor explicar la regla.
    const subAhorro = capacidad.aporteInicial > 0
        ? `${fmt(capacidad.aporteInicial)} de aporte inicial · ${fmt(capacidad.ahorroMensual)} de ahorro mensual`
        : 'Acumulado de tus ahorros mensuales';
    const notaCupo = !v
        ? 'Consulta el Analizador de Capacidad para el detalle'
        : deuda > 0
            ? `Techo 3× tu ahorro: ${fmt(v.montoMaxSinVotacion)} · deuda vigente: ${fmt(deuda)}`
            : 'Regla del fondo: hasta 3× tu ahorro acreditado';

    return (
        <div className="space-y-2.5">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <Tarjeta
                    icon={PiggyBank}
                    etiqueta="Mi ahorro acreditado"
                    valor={fmt(capacidad.ahorroTotal)}
                    sub={subAhorro}
                    nota={capacidad.mesesComoSocio ? `${capacidad.mesesComoSocio} meses como socio` : null}
                    onClick={() => navigate('/dashboard/cuenta')}
                />
                <Tarjeta
                    icon={Coins}
                    etiqueta={`Mi parte estimada ${utilidades?.anio || ''}`.trim()}
                    valor={utilidades ? fmt(utilidades.valorEstimado) : '—'}
                    tono="dorado"
                    sub={utilidades
                        ? `${utilidades.participacionPct.toFixed(2).replace('.', ',')}% de ${fmt(utilidades.utilidades)} de utilidad acumulada`
                        : 'Aún no hay utilidad acumulada en el año'}
                    /* La cifra es un estimado sobre resultados parciales, no un
                       derecho adquirido: decirlo evita que el socio la lea como
                       un pago comprometido. */
                    nota={utilidades ? 'Estimación sobre el año en curso · no es una cifra aprobada ni distribuida' : null}
                />
                <Tarjeta
                    icon={TrendingUp}
                    etiqueta="Puedo pedir hasta"
                    /* Sin `v` el cupo NO es cero — es desconocido. Mostrar $0 en rojo
                       le diría al socio que agotó su cupo cuando en realidad falló el
                       cálculo: un dato ausente nunca debe leerse como una mala noticia. */
                    valor={v ? fmt(cupoLibre) : '—'}
                    tono={!v ? 'gris' : cupoLibre > 0 ? 'verde' : 'rojo'}
                    sub={!v
                        ? 'No se pudo calcular tu cupo en este momento'
                        : cupoLibre > 0
                            ? 'Sin necesidad de votación de la Junta'
                            : 'Cupo agotado · un nuevo crédito requiere votación'}
                    nota={notaCupo}
                    onClick={() => navigate('/dashboard/loan-capacity-beta')}
                />
                <Tarjeta
                    icon={Gauge}
                    etiqueta="Mi score de crédito"
                    valor={score ? `${score.score}/100` : '—'}
                    tono={!score ? 'gris' : score.color === 'red' ? 'rojo' : (score.color === 'amber' || score.color === 'yellow') ? 'dorado' : 'verde'}
                    sub={score ? `Nivel ${score.nivel}` : null}
                    nota={capacidad.enMoraActual
                        ? `${capacidad.totalCuotasMoraEP} cuota(s) en mora — afecta tu score`
                        : 'Cartera al día'}
                    onClick={() => navigate('/dashboard/loan-capacity-beta')}
                />
            </div>
            <p className="text-[11px] text-gray-400 leading-snug">
                {primerNombre ? `${primerNombre}, estas` : 'Estas'} cuatro cifras son solo tuyas: se calculan con tus ahorros y tus
                cuotas, y ningún otro socio las ve. Tu participación en las utilidades se reparte según el ahorro mensual del año en
                curso, no según el ahorro acumulado de todos los años.
            </p>
        </div>
    );
};

export default MiPosicionFondo;
