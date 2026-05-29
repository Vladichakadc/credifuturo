import React, { useState, useEffect, useRef } from 'react';
import { useSortTable, SortIcon } from '../../utils/useSortTable';
import api from '../../config/api';
import {
    Scale, ChevronDown, Loader2, PiggyBank, CreditCard,
    Award, TrendingUp, TrendingDown, CheckCircle, XCircle,
    AlertCircle, AlertTriangle, Users, Search, X
} from 'lucide-react';
import { useUi } from '../../context/UiContext';

const SocioSelect = ({ clients, selectedId, onSelect }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = clients.filter(c => {
        const full = `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''} ${c.cedula || ''}`.toLowerCase();
        return full.includes(search.toLowerCase());
    });

    const selected = clients.find(c => String(c.id) === String(selectedId));
    const label = selected
        ? `${selected.name} ${selected.surname1 || ''} ${selected.surname2 || ''}`.trim()
        : 'Socio: Seleccionar...';

    return (
        <div className="relative w-full" ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-left ${selectedId ? 'bg-brand-primary/10 border-brand-primary/40' : 'bg-emerald-50 border-emerald-200'}`}
            >
                <Users className={`h-4 w-4 flex-shrink-0 ${selectedId ? 'text-brand-primary' : 'text-emerald-600'}`} />
                <span className={`flex-1 text-sm font-semibold truncate ${selectedId ? 'text-gray-800' : 'text-gray-500'}`}>{label}</span>
                {selected && (
                    <span className="text-[10px] font-bold text-brand-primary/70 bg-brand-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {selected.customerId || `CC ${selected.cedula}`}
                    </span>
                )}
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[60] overflow-hidden">
                    <div className="p-3 border-b border-gray-100">
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                            <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            <input
                                autoFocus
                                aria-label="Buscar socio por nombre o cédula"
                                type="text"
                                placeholder="Buscar por nombre o cédula..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-6">Sin resultados</p>
                        ) : filtered.map(c => {
                            const fullName = `${c.name || ''} ${c.surname1 || ''} ${c.surname2 || ''}`.trim();
                            const isActive = String(c.id) === String(selectedId);
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { onSelect(String(c.id)); setOpen(false); setSearch(''); }}
                                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors ${isActive ? 'bg-brand-primary/10' : 'hover:bg-gray-50'}`}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${isActive ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                                        {(c.name || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold truncate ${isActive ? 'text-brand-primary' : 'text-gray-800'}`}>{fullName}</p>
                                        <p className="text-[10px] text-gray-400 font-mono">{c.customerId || ''}{c.cedula ? ` · C.C. ${c.cedula}` : ''}</p>
                                    </div>
                                    {isActive && <CheckCircle className="h-4 w-4 text-brand-primary flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 font-semibold">{filtered.length} socio{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const LoanAnalyzerPage = () => {
    const { toast } = useUi();
    const [clients, setClients] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    const { sortedData: sortedVigentes, sortConfig: vigentesSort, handleSort: handleVigentesSort } =
        useSortTable(analysis?.prestamosVigentes || []);

    useEffect(() => {
        api.get('/admin/clients/list')
            .then(res => {
                if (res.data?.ok && Array.isArray(res.data.data)) {
                    setClients(res.data.data.filter(c => c.estatus === 'Activo'));
                }
            })
            .catch(() => {});
    }, []);

    const handleSelect = async (id) => {
        setSelectedId(id);
        if (!id) { setAnalysis(null); return; }
        setLoadingAnalysis(true);
        try {
            const res = await api.get(`/admin/clients/${id}/loan-capacity`);
            setAnalysis(res.data);
        } catch {
            toast.error('Error al cargar análisis del socio.');
            setAnalysis(null);
        } finally {
            setLoadingAnalysis(false);
        }
    };


    // ── Lógica financiera experta ──────────────────────────────────────────────
    const calcVerdict = (a) => {
        if (!a) return null;
        const FACTOR_MAX = 3;
        const montoMaxSinVotacion = a.ahorroTotal * FACTOR_MAX;
        const capacidadDisponible = montoMaxSinVotacion - a.totalDeudaPendiente;
        const tasaApalancamiento  = a.ahorroTotal > 0 ? (a.totalDeudaPendiente / a.ahorroTotal) * 100 : 0;
        const totalCuotas         = a.historialPagoTotal + a.historialMoraTotal + a.historialPendTotal;
        const tasaMora            = totalCuotas > 0 ? (a.historialMoraTotal / totalCuotas) * 100 : 0;
        const totalMoraEP         = a.totalCuotasMoraEP || 0;

        const riesgos = [];
        const positivos = [];

        if (a.enMoraActual)
            riesgos.push(`Tiene ${totalMoraEP} cuota(s) vencidas sin pagar (Mora EP) — valor: $${(a.totalMoraEPValor || 0).toLocaleString('es-CO')}`);
        else
            positivos.push('Sin cuotas vencidas (Mora EP) en préstamos vigentes');

        if (a.historialMoraTotal > 0)
            riesgos.push(`Historial con ${a.historialMoraTotal} cuota(s) en mora registrada(s)`);
        else
            positivos.push('Historial crediticio limpio — 0 moras registradas');

        if (tasaApalancamiento > 200)
            riesgos.push(`Apalancamiento crítico: deuda equivale al ${tasaApalancamiento.toFixed(0)}% del ahorro`);
        else if (tasaApalancamiento > 100)
            riesgos.push(`Apalancamiento elevado: deuda equivale al ${tasaApalancamiento.toFixed(0)}% del ahorro`);
        else if (tasaApalancamiento > 0)
            positivos.push(`Apalancamiento saludable: ${tasaApalancamiento.toFixed(0)}% deuda/ahorro`);
        else
            positivos.push('Sin deuda pendiente registrada');

        if (a.ahorroTotal === 0)
            riesgos.push('Sin ahorro acumulado — no se puede calcular capacidad');
        else if (a.ahorroTotal < 500000)
            riesgos.push(`Ahorro bajo ($${a.ahorroTotal.toLocaleString('es-CO')}) — limita capacidad de endeudamiento`);
        else
            positivos.push(`Ahorro acumulado: $${a.ahorroTotal.toLocaleString('es-CO')} (aportes + mensual)`);

        if (capacidadDisponible > 0)
            positivos.push(`Margen disponible sin votación: $${Math.round(capacidadDisponible).toLocaleString('es-CO')}`);
        else
            riesgos.push('No hay capacidad adicional sin votación del fondo');

        let verdict, color, icon, mensaje, recomendacion;
        if (a.ahorroTotal === 0) {
            verdict = 'NO VIABLE';
            color   = 'red';   icon = 'X';
            mensaje = 'El socio no tiene ahorro acumulado registrado. La política del fondo exige ahorro base para calcular el límite de endeudamiento.';
            recomendacion = 'Rechazar solicitud. Invitar al socio a regularizar sus aportes antes de presentar una nueva solicitud.';
        } else if (a.enMoraActual) {
            verdict = 'NO VIABLE — MORA EP ACTIVA';
            color   = 'red';   icon = 'X';
            mensaje = `El socio tiene ${totalMoraEP} cuota(s) vencida(s) sin pagar por $${(a.totalMoraEPValor || 0).toLocaleString('es-CO')}. La fecha límite de pago ya venció. Ningún reglamento de fondo solidario autoriza nuevos desembolsos con mora vigente.`;
            recomendacion = 'Rechazar solicitud. Exigir paz y salvo total antes de cualquier nuevo trámite. Las cuotas en mora deben quedar en estado "Pago" para reconsiderar.';
        } else if (capacidadDisponible <= 0) {
            verdict = 'REQUIERE VOTACIÓN DEL FONDO';
            color   = 'amber'; icon = 'vote';
            mensaje = `La deuda pendiente ($${Math.round(a.totalDeudaPendiente).toLocaleString('es-CO')}) supera el límite de 3× el ahorro ($${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}). Cualquier nuevo préstamo excede el techo sin votación.`;
            recomendacion = 'Someter a votación del fondo. El monto solicitado no puede exceder la capacidad de pago histórica demostrada. Se recomienda análisis caso a caso con todos los asociados.';
        } else if (a.historialMoraTotal > 2 || tasaMora > 20) {
            verdict = 'VIABLE CON RESTRICCIONES';
            color   = 'yellow'; icon = 'warn';
            mensaje = `El socio califica por ahorro (max sin votación: $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}), pero su historial registra mora en ${tasaMora.toFixed(0)}% de las cuotas. Se recomienda precaución.`;
            recomendacion = `Puede aprobarse hasta $${Math.round(Math.min(capacidadDisponible, montoMaxSinVotacion * 0.5)).toLocaleString('es-CO')} (50% del techo) como medida de mitigación. Exigir garantía adicional o codeudor.`;
        } else {
            verdict = 'VIABLE SIN VOTACIÓN';
            color   = 'green'; icon = 'check';
            mensaje = `El socio cumple todos los requisitos. Puede solicitar hasta $${Math.round(capacidadDisponible).toLocaleString('es-CO')} sin necesidad de votación del fondo (techo 3×: $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}).`;
            recomendacion = `Aprobar hasta $${Math.round(capacidadDisponible).toLocaleString('es-CO')} sin votación. Para montos superiores hasta $${Math.round(montoMaxSinVotacion).toLocaleString('es-CO')}, también es viable pero requiere votación del fondo.`;
        }

        return { verdict, color, icon, mensaje, recomendacion, montoMaxSinVotacion, capacidadDisponible, tasaApalancamiento, tasaMora, totalMoraEP, riesgos, positivos };
    };

    const v = calcVerdict(analysis);
    const colorMap = {
        green:  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600' },
        yellow: { bg: 'bg-yellow-50',  border: 'border-yellow-300',  text: 'text-yellow-800',  badge: 'bg-yellow-500' },
        amber:  { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-800',   badge: 'bg-amber-500'  },
        red:    { bg: 'bg-red-50',     border: 'border-red-300',     text: 'text-red-800',     badge: 'bg-red-600'    },
    };
    const c = v ? (colorMap[v.color] || colorMap.green) : null;

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                    <Scale className="h-6 w-6 text-emerald-600" />
                    Analizador de Capacidad de Préstamo
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                    Evaluación financiera experta · Regla 3× Ahorro Acumulado · Sin mínimo requerido
                </p>
            </div>

            {/* Main card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="bg-gradient-to-r from-brand-primary to-emerald-700 px-6 py-4 flex items-center gap-3">
                    <div className="bg-white/20 rounded-xl p-2">
                        <Scale className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-base">Análisis de Viabilidad de Préstamo</h3>
                        <p className="text-emerald-200 text-xs">Máximo sin votación = 3× ahorro · Monto mayor requiere votación del fondo</p>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* Selector */}
                    <SocioSelect clients={clients} selectedId={selectedId} onSelect={handleSelect} />

                    {/* Loading */}
                    {loadingAnalysis && (
                        <div className="flex items-center justify-center py-12 gap-3 text-brand-primary">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="text-sm font-medium">Analizando perfil financiero...</span>
                        </div>
                    )}

                    {/* Analysis result */}
                    {analysis && v && !loadingAnalysis && (
                        <div className="space-y-4">
                            {/* Member header */}
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                    {analysis.nombre?.charAt(0) ?? '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 text-sm truncate">{analysis.nombre}</p>
                                    <p className="text-xs text-gray-500">CC {analysis.cedula ?? 'N/A'} · Estado: <span className="font-semibold text-emerald-600">{analysis.estatus ?? '—'}</span></p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Préstamos con cuotas activas</p>
                                    <p className="text-lg font-black text-brand-primary">{analysis.totalPrestamosVigentes}</p>
                                </div>
                            </div>

                            {/* Key metrics grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-emerald-50 rounded-xl p-3 border border-white">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <PiggyBank className="h-3.5 w-3.5 text-emerald-600" />
                                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Ahorro Acumulado</span>
                                    </div>
                                    <p className="text-base font-black text-emerald-600">${Math.round(analysis.ahorroTotal).toLocaleString('es-CO')}</p>
                                    <p className="text-[9px] text-emerald-500 mt-0.5">Aportes + Mensual</p>
                                </div>
                                <div className={`rounded-xl p-3 border border-white ${analysis.enMoraActual ? 'bg-red-50 border-red-200' : analysis.totalDeudaPendiente > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <CreditCard className={`h-3.5 w-3.5 ${analysis.enMoraActual ? 'text-red-600' : analysis.totalDeudaPendiente > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
                                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Deuda Pendiente</span>
                                    </div>
                                    <p className={`text-base font-black ${analysis.enMoraActual ? 'text-red-700' : analysis.totalDeudaPendiente > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                        ${Math.round(analysis.totalDeudaPendiente).toLocaleString('es-CO')}
                                    </p>
                                    <p className={`text-[9px] mt-0.5 ${analysis.enMoraActual ? 'text-red-500' : 'text-orange-400'}`}>
                                        {analysis.enMoraActual
                                            ? `⚠ ${analysis.totalCuotasMoraEP} vencida(s) · $${(analysis.totalMoraEPValor || 0).toLocaleString('es-CO')}`
                                            : analysis.totalPrestamosVigentes > 0
                                                ? `${analysis.prestamosVigentes.reduce((s, l) => s + l.cuotasPendientesCount, 0)} cuota(s) por vencer`
                                                : 'Sin préstamos activos'}
                                    </p>
                                </div>
                                <div className="bg-blue-50 rounded-xl p-3 border border-white">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Award className="h-3.5 w-3.5 text-blue-600" />
                                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Máximo Sin Votación</span>
                                    </div>
                                    <p className="text-base font-black text-blue-600">${Math.round(v.montoMaxSinVotacion).toLocaleString('es-CO')}</p>
                                    <p className="text-[9px] text-blue-400 mt-0.5">3 × Ahorro Acumulado</p>
                                </div>
                                <div className={`rounded-xl p-3 border border-white ${v.capacidadDisponible > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <TrendingUp className={`h-3.5 w-3.5 ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`} />
                                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Capacidad Disponible</span>
                                    </div>
                                    <p className={`text-base font-black ${v.capacidadDisponible > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        ${Math.max(0, Math.round(v.capacidadDisponible)).toLocaleString('es-CO')}
                                    </p>
                                    <p className={`text-[9px] mt-0.5 ${v.capacidadDisponible > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {v.capacidadDisponible > 0 ? 'Sin necesidad de votación' : 'Requiere votación del fondo'}
                                    </p>
                                </div>
                            </div>

                            {/* Leverage bar */}
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-xs font-semibold text-gray-600">Nivel de Apalancamiento (Deuda / Ahorro)</span>
                                    <span className={`text-xs font-black ${v.tasaApalancamiento > 200 ? 'text-red-600' : v.tasaApalancamiento > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {v.tasaApalancamiento.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className={`h-2.5 rounded-full transition-all duration-700 ${v.tasaApalancamiento > 200 ? 'bg-red-500' : v.tasaApalancamiento > 100 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(100, v.tasaApalancamiento / 3)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-0.5">
                                    <span className="text-[9px] text-gray-400">0%</span>
                                    <span className="text-[9px] text-gray-400">100% (1×)</span>
                                    <span className="text-[9px] text-gray-400">200% (2×)</span>
                                    <span className="text-[9px] text-gray-400">300% (3× límite)</span>
                                </div>
                            </div>

                            {/* Risk factors */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {v.positivos.map((p, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                                        <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                                        <span>{p}</span>
                                    </div>
                                ))}
                                {v.riesgos.map((r, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
                                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-red-500" />
                                        <span>{r}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Loans table */}
                            {analysis.prestamosVigentes.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Detalle de Préstamos con Cuotas Pendientes</p>
                                    <div className="overflow-hidden rounded-xl border border-gray-100">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                                                    {[
                                                        { key: 'idVm',                 label: 'ID',               cls: 'text-left' },
                                                        { key: 'valorPrestado',        label: 'Val. Prestado',    cls: 'text-right' },
                                                        { key: 'saldoPendiente',       label: 'Saldo Pendiente',  cls: 'text-right' },
                                                        { key: 'valorCuotasPendientes',label: 'Val. Cuotas Pend.',cls: 'text-right' },
                                                        { key: 'cuotasPendientesCount',label: 'Cuotas',           cls: 'text-center' },
                                                        { key: 'interesMensual',       label: 'Interés',          cls: 'text-center' },
                                                        { key: 'enMoraEP',             label: 'Estado',           cls: 'text-center' },
                                                    ].map(col => (
                                                        <th key={col.key} className={`px-3 py-2 cursor-pointer select-none hover:bg-gray-200 transition-colors ${col.cls}`} onClick={() => handleVigentesSort(col.key)}>
                                                            <span className="inline-flex items-center gap-1">{col.label}<SortIcon colKey={col.key} sortConfig={vigentesSort} /></span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedVigentes.map((loan, i) => (
                                                    <tr key={i} className={`border-t border-gray-100 ${loan.enMoraEP ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                        <td className="px-3 py-2.5 font-bold text-gray-700">{loan.idVm}</td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600">
                                                            {loan.valorPrestado > 0 ? `$${Math.round(loan.valorPrestado).toLocaleString('es-CO')}` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-bold">
                                                            <span className={loan.enMoraEP ? 'text-red-600' : 'text-gray-800'}>
                                                                ${Math.round(loan.saldoPendiente).toLocaleString('es-CO')}
                                                            </span>
                                                            <div className="text-[9px] font-normal text-gray-400">Balance real</div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                                                            ${Math.round(loan.valorCuotasPendientes).toLocaleString('es-CO')}
                                                            <div className="text-[9px] font-normal text-gray-400">Suma cuotas</div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            <span className="font-semibold text-gray-700">
                                                                {loan.cuotasPendientesCount + loan.cuotasMoraEPCount}
                                                            </span>
                                                            {loan.cuotas && <span className="text-gray-400"> / {loan.cuotas}</span>}
                                                            {loan.cuotasMoraEPCount > 0 && (
                                                                <div className="text-[9px] text-red-500 font-bold">{loan.cuotasMoraEPCount} vencida(s)</div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center text-gray-600">
                                                            {loan.interesMensual > 0 ? `${loan.interesMensual.toFixed(2)}% m` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${loan.enMoraEP ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {loan.enMoraEP ? `Mora EP ×${loan.cuotasMoraEPCount}` : 'Al día'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-gray-100 font-bold text-gray-700 border-t-2 border-gray-200">
                                                    <td className="px-3 py-2 text-[10px] uppercase">Total</td>
                                                    <td className="px-3 py-2 text-right">—</td>
                                                    <td className="px-3 py-2 text-right text-red-700">
                                                        ${Math.round(analysis.totalDeudaPendiente).toLocaleString('es-CO')}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-amber-700">
                                                        ${Math.round(analysis.prestamosVigentes.reduce((s, l) => s + l.valorCuotasPendientes, 0)).toLocaleString('es-CO')}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {analysis.prestamosVigentes.reduce((s, l) => s + l.cuotasPendientesCount + l.cuotasMoraEPCount, 0)}
                                                        {analysis.totalCuotasMoraEP > 0 && (
                                                            <div className="text-[9px] text-red-600 font-bold">{analysis.totalCuotasMoraEP} en mora</div>
                                                        )}
                                                    </td>
                                                    <td colSpan={2}></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-1.5 italic">
                                        * Saldo Pendiente = balance real (saldo inicial próxima cuota). Val. Cuotas Pend. = suma cuotas × intereses por pagar.
                                    </p>
                                </div>
                            )}

                            {/* Verdict box */}
                            <div className={`${c.bg} border-2 ${c.border} rounded-xl p-4`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`${c.badge} rounded-lg p-2`}>
                                        {v.icon === 'check' && <CheckCircle className="h-5 w-5 text-white" />}
                                        {v.icon === 'X'     && <XCircle className="h-5 w-5 text-white" />}
                                        {v.icon === 'warn'  && <AlertCircle className="h-5 w-5 text-white" />}
                                        {v.icon === 'vote'  && <Scale className="h-5 w-5 text-white" />}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Veredicto Financiero</p>
                                        <p className={`text-sm font-black ${c.text}`}>{v.verdict}</p>
                                    </div>
                                </div>
                                <p className={`text-xs leading-relaxed ${c.text} mb-3`}>{v.mensaje}</p>
                                <div className="border-t border-current/10 pt-3">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Recomendación del Analista</p>
                                    <p className={`text-xs font-semibold leading-relaxed ${c.text}`}>{v.recomendacion}</p>
                                </div>
                            </div>

                            {/* Payment history */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Historial Completo de Cuotas</p>
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div className="bg-emerald-50 rounded-xl py-2.5 border border-emerald-100">
                                        <p className="text-xl font-black text-emerald-600">{analysis.historialPagoTotal}</p>
                                        <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mt-0.5">Pagadas</p>
                                    </div>
                                    <div className={`rounded-xl py-2.5 border ${analysis.totalCuotasMoraEP > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                                        <p className={`text-xl font-black ${analysis.totalCuotasMoraEP > 0 ? 'text-red-700' : 'text-gray-300'}`}>
                                            {analysis.totalCuotasMoraEP || 0}
                                        </p>
                                        <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${analysis.totalCuotasMoraEP > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                            Mora EP Activa
                                        </p>
                                        {analysis.totalCuotasMoraEP > 0 && (
                                            <p className="text-[9px] text-red-400">${(analysis.totalMoraEPValor || 0).toLocaleString('es-CO')}</p>
                                        )}
                                    </div>
                                    <div className={`rounded-xl py-2.5 border ${analysis.historialMoraTotal > 0 ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                                        <p className={`text-xl font-black ${analysis.historialMoraTotal > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                                            {analysis.historialMoraTotal}
                                        </p>
                                        <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${analysis.historialMoraTotal > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
                                            Mora Histórica
                                        </p>
                                    </div>
                                    <div className={`rounded-xl py-2.5 border ${analysis.historialPendTotal > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                                        <p className={`text-xl font-black ${analysis.historialPendTotal > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                                            {analysis.historialPendTotal}
                                        </p>
                                        <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${analysis.historialPendTotal > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                                            Por Vencer
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!selectedId && !loadingAnalysis && (
                        <div className="text-center py-12 text-gray-400">
                            <TrendingDown className="h-12 w-12 mx-auto mb-3 opacity-25" />
                            <p className="text-sm font-medium">Selecciona un socio para ver el análisis de capacidad</p>
                            <p className="text-xs mt-1">Basado en regla de 3× el ahorro acumulado</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoanAnalyzerPage;
