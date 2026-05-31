import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { RefreshCw, PiggyBank, Inbox, Download, ChevronLeft, ChevronRight, FileDown, Loader2, CheckCircle2, Clock, AlertTriangle, Hash, Calculator, TrendingUp, Activity, ArrowUpToLine, Shield } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, LineChart, Line, PieChart, Pie, Cell, ReferenceLine } from 'recharts';
import html2canvas from 'html2canvas';
import SavingsListPDF from './SavingsListPDF'; // Nuevo componente para el PDF

const fmtCOP = v => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const ACCENT_PALETTE = ['#166534', '#fbbf24', '#1a7a42', '#d97706', '#2d9652', '#f5c518', '#052e16'];

// Clasificación semántica + descripción contextual para cada tipo de movimiento.
// kind: 'credito' suma al saldo, 'debito' lo reduce, 'neutro' es informativo.
const classifyMovement = (status, index) => {
    const s = (status || '').toLowerCase();
    if (s.includes('abono') || s.includes('deposito') || s.includes('pagado') || s.includes('activo') || s.includes('vigente'))
        return { label: 'Capital Acreditado', accent: '#166534', Icon: CheckCircle2, kind: 'credito',
            desc: 'Ahorros mensuales abonados efectivamente a tu cuenta del fondo.' };
    if (s.includes('descuento') || s.includes('penaliz') || s.includes('mora') || s.includes('multa') || s.includes('sancion'))
        return { label: 'Penalización por Mora', accent: '#d97706', Icon: AlertTriangle, kind: 'debito',
            desc: 'Descuentos aplicados por incumplimiento en la fecha límite de aporte.' };
    if (s.includes('interes') || s.includes('distribucion') || s.includes('rendimiento') || s.includes('dividendo'))
        return { label: 'Rendimientos Distribuidos', accent: '#fbbf24', Icon: TrendingUp, kind: 'credito',
            desc: 'Intereses generados por el fondo y abonados a los socios.' };
    if (s.includes('pendiente') || s.includes('proceso'))
        return { label: status, accent: '#f5c518', Icon: Clock, kind: 'neutro',
            desc: 'Movimientos en proceso de conciliación.' };
    return { label: status, accent: ACCENT_PALETTE[index % ACCENT_PALETTE.length], Icon: Hash, kind: 'neutro',
        desc: 'Otros movimientos registrados en tu cuenta.' };
};

const TABLE_COLUMNS = [
    { key: 'externalId', label: 'Id_VM', align: 'center', minWidth: '90px', highlight: true },
    { key: 'status', label: 'Estado', align: 'center', minWidth: '120px', isTypeBadge: true },
    { key: 'date', label: 'Fecha Pago', align: 'center', minWidth: '110px', isDate: true },
    { key: 'periodo', label: 'Periodo', align: 'center', minWidth: '130px', isPeriodo: true },
    { key: 'amount', label: 'Valor Bruto', align: 'right', minWidth: '120px', isCurrency: true },
    { key: 'valorAhorrado', label: 'Valor Neto', align: 'right', minWidth: '120px', isCurrency: true },
    { key: 'penalizacion', label: 'Penaliz.', align: 'center', minWidth: '90px', isPenBadge: true },
    { key: 'valorAPenalizar', label: 'Descuento', align: 'right', minWidth: '110px', isCurrency: true },
    { key: 'delta', label: 'Δ vs mes anterior', align: 'center', minWidth: '130px', isDelta: true },
    { key: 'acumulado', label: 'Acumulado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'type', label: 'Tipo', align: 'center', minWidth: '120px' },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '120px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '180px' },
];

const ITEMS_PER_PAGE = 25;

const TypeBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs italic">—</span>;
    return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 bg-emerald-100 text-emerald-800 ring-emerald-200">
            {value}
        </span>
    );
};

const PenBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs italic">—</span>;
    const isSI = value.trim().toUpperCase() === 'SI';
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${isSI ? 'bg-amber-100 text-amber-900 ring-amber-200' : 'bg-emerald-100 text-emerald-800 ring-emerald-200'}`}>
            {value}
        </span>
    );
};

const CellValue = ({ column, value, row }) => {
    if (column.isTypeBadge) return <TypeBadge value={value} />;
    if (column.isPenBadge) return <PenBadge value={value} />;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (column.isPeriodo) {
        const mes = row?.month || '';
        const anio = row?.year || '';
        if (!mes && !anio) return <span className="text-gray-300 text-xs italic">—</span>;
        return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{mes} {anio}</span>;
    }
    if (column.isDelta) {
        if (value == null || isNaN(value)) return <span className="text-gray-300 text-xs italic">—</span>;
        if (value === 0) return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">sin cambio</span>;
        const pos = value > 0;
        return (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${pos ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                {pos ? '▲' : '▼'} {pos ? '+' : ''}${Math.abs(value).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
        );
    }
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 text-xs italic">—</span>;
    if (column.isCurrency) {
        const num = parseFloat(value);
        if (isNaN(num)) return <span className="text-gray-300 text-xs italic">—</span>;
        if (column.key === 'valorAPenalizar' && num > 0) {
            return <span className="font-medium text-amber-700 tabular-nums">−${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>;
        }
        if (column.key === 'acumulado') {
            return <span className="font-bold text-emerald-700 tabular-nums">${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>;
        }
        return <span className={`font-medium tabular-nums ${num === 0 ? 'text-gray-400' : 'text-gray-900'}`}>${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>;
    }
    if (column.highlight) return <span className="font-bold text-emerald-800">{value}</span>;
    return <span className="text-gray-700">{value}</span>;
};

const UserSavingsListPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    const { toast } = useUi();
    const [savings, setSavings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [chartImage, setChartImage] = useState(null);
    const [profile, setProfile] = useState(null);

    const pdfRef = React.useRef(null);
    const chartRef = React.useRef(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [res, profileRes] = await Promise.all([
                api.get('/admin/my/savings'),
                api.get('/admin/my/profile')
            ]);

            if (res.data && res.data.ok) {
                setSavings(res.data.data);
            } else {
                throw new Error('Error del servidor al cargar ahorros');
            }
            if (profileRes.data) setProfile(profileRes.data);
        } catch (err) {
            setError(err.message || 'Error de conexión');
            setSavings([]);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredSavings = useMemo(() => {
        let result = savings;

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            result = result.filter(s =>
                (s.externalId && s.externalId.toLowerCase().includes(term)) ||
                (s.month && s.month.toLowerCase().includes(term)) ||
                (s.banco && s.banco.toLowerCase().includes(term))
            );
        }

        if (filterStatus) {
            const term = filterStatus.trim().toLowerCase();
            result = result.filter(s => (s.status || '').trim().toLowerCase() === term);
        }

        return result;
    }, [savings, searchTerm, filterStatus]);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterStatus]);

    // Paginated data
    const paginatedSavings = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredSavings.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredSavings, currentPage]);

    const savingsByYear = useMemo(() => {
        const data = filteredSavings.reduce((acc, curr) => {
            const year = curr.year || (curr.date ? new Date(curr.date).getFullYear().toString() : null);
            if (year) {
                if (!acc[year]) acc[year] = 0;
                acc[year] += parseFloat(curr.valorAhorrado || curr.amount || 0);
            }
            return acc;
        }, {});

        return Object.keys(data)
            .sort((a, b) => a - b)
            .map(year => ({
                name: year,
                ahorros: data[year]
            }));
    }, [filteredSavings]);

    const summaryStats = useMemo(() => {
        const totalAhorrado = filteredSavings.reduce((acc, curr) => acc + parseFloat(curr.valorAhorrado || curr.amount || 0), 0);
        const totalBruto = filteredSavings.reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);
        const totalPenalizado = filteredSavings.reduce((acc, curr) => acc + parseFloat(curr.valorAPenalizar || 0), 0);
        const numAportes = filteredSavings.length;
        const aporteMensuales = filteredSavings.filter(s => (s.type || '').toLowerCase().includes('mensual'));
        const aportePromedio = aporteMensuales.length > 0
            ? aporteMensuales.reduce((s, r) => s + parseFloat(r.valorAhorrado || r.amount || 0), 0) / aporteMensuales.length
            : 0;
        const aporteMaximo = filteredSavings.reduce((m, r) => Math.max(m, parseFloat(r.valorAhorrado || r.amount || 0)), 0);
        const fechas = filteredSavings
            .map(s => s.date ? new Date(s.date) : null)
            .filter(d => d && !isNaN(d.getTime()))
            .sort((a, b) => a - b);
        const ultimoAporte = fechas[fechas.length - 1] || null;
        const diasDesdeUltimo = ultimoAporte ? Math.floor((Date.now() - ultimoAporte.getTime()) / 86400000) : null;
        const conPenalizacion = filteredSavings.filter(s => parseFloat(s.valorAPenalizar || 0) > 0).length;
        const tasaCumplimiento = numAportes > 0 ? ((numAportes - conPenalizacion) / numAportes) * 100 : 100;

        return {
            totalAhorrado, totalBruto, totalPenalizado, numAportes,
            aportePromedio, aporteMaximo, ultimoAporte, diasDesdeUltimo,
            conPenalizacion, tasaCumplimiento
        };
    }, [filteredSavings]);

    // Tendencia mensual (últimos 12 meses): valor neto ahorrado
    const monthlyTrend = useMemo(() => {
        const buckets = {};
        filteredSavings.forEach(s => {
            const f = s.date ? new Date(s.date) : null;
            if (!f || isNaN(f.getTime())) return;
            const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
            buckets[key] = (buckets[key] || 0) + parseFloat(s.valorAhorrado || s.amount || 0);
        });
        return Object.entries(buckets)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-12)
            .map(([k, v]) => ({ mes: k.slice(2).replace('-', '/'), valor: v }));
    }, [filteredSavings]);

    const trendStats = useMemo(() => {
        if (monthlyTrend.length === 0) return { avg: 0, max: 0, min: 0, latest: 0, deltaPct: 0 };
        const avg = monthlyTrend.reduce((s, x) => s + x.valor, 0) / monthlyTrend.length;
        const max = Math.max(...monthlyTrend.map(x => x.valor));
        const min = Math.min(...monthlyTrend.map(x => x.valor));
        const latest = monthlyTrend[monthlyTrend.length - 1]?.valor || 0;
        const deltaPct = avg > 0 ? ((latest - avg) / avg) * 100 : 0;
        return { avg, max, min, latest, deltaPct };
    }, [monthlyTrend]);

    // Métricas económicas avanzadas
    const fmtShortDate = (d) => d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    const statsByStatus = useMemo(() => {
        const map = {};
        savings.forEach(s => {
            const status = (s.status || 'Sin Estado').trim();
            if (!map[status]) map[status] = { total: 0, count: 0 };
            map[status].total += parseFloat(s.valorAhorrado || s.amount || 0);
            map[status].count += 1;
        });
        return Object.entries(map)
            .sort(([a], [b]) => a.localeCompare(b, 'es'))
            .map(([status, d]) => ({ status, ...d }));
    }, [savings]);

    const economics = useMemo(() => {
        const costoPenalizacionPct = summaryStats.totalBruto > 0
            ? (summaryStats.totalPenalizado / summaryStats.totalBruto) * 100
            : 0;
        // Rendimiento implícito: si hay distribución de intereses, qué % representa sobre el capital acreditado
        const intereses = statsByStatus
            .filter(s => /interes|distribucion|rendimiento|dividendo/i.test(s.status))
            .reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
        const rendimientoPct = summaryStats.totalAhorrado > 0
            ? (intereses / (summaryStats.totalAhorrado - intereses || 1)) * 100
            : 0;
        return { costoPenalizacionPct, rendimientoImplicitoTotal: intereses, rendimientoPct };
    }, [summaryStats, statsByStatus]);

    const uniqueStatuses = useMemo(() => {
        const statuses = savings.map(s => (s.status || '').trim()).filter(Boolean);
        return [...new Set(statuses)].sort();
    }, [savings]);

    const handleExport = () => {
        if (filteredSavings.length === 0) { toast.error('No hay datos para exportar.'); return; }
        const exportData = filteredSavings.map(s => ({
            'Id_VM': s.externalId,
            'Estado': s.status,
            'Fecha Pago': formatDate(s.date),
            'Mes': s.month,
            'Año': s.year,
            'Valor Mensual': s.amount,
            'Valor Ahorrado': s.valorAhorrado,
            'Penalización': s.penalizacion,
            'Valor Penalizado': s.valorAPenalizar,
            'Tipo': s.type,
            'Banco': s.banco,
            'Observaciones': s.observaciones
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mis Ahorros');
        XLSX.writeFile(wb, 'Mis_Ahorros.xlsx');
        toast.success('Exportado exitosamente');
    };

    const handleGeneratePdf = async () => {
        // ── Pre-flight validation ──────────────────────────────────────────────
        if (!profile) {
            toast.error('Datos de perfil no disponibles. Recarga la página e intenta de nuevo.');
            return;
        }
        if (!filteredSavings || filteredSavings.length === 0) {
            toast.error('No hay movimientos de ahorro para incluir en el PDF.');
            return;
        }

        setIsGeneratingPdf(true);
        toast.info('Generando Informe de Estado de Cuenta… esto puede tardar unos segundos.', { duration: 8000 });

        try {
            // ── STEP 1: Capture chart sequentially (non-fatal) ────────────────
            let capturedChartImage = null;
            if (chartRef.current) {
                try {
                    const chartCanvas = await html2canvas(chartRef.current, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        logging: false,
                        useCORS: true,
                        allowTaint: true,
                    });
                    capturedChartImage = chartCanvas.toDataURL('image/png', 1.0);
                } catch (chartErr) {
                    console.warn('No se pudo capturar el gráfico:', chartErr);
                    // Non-fatal: PDF will be generated without the chart image
                }
            }

            // Inject captured image into the hidden <SavingsListPDF> component
            setChartImage(capturedChartImage);

            // ── STEP 2: Wait 300 ms for React to re-render with chart image ────
            // 300 ms gives React enough time to paint the <img> before html2canvas
            // takes the screenshot. 100 ms was too short, causing blank chart boxes.
            await new Promise(resolve => setTimeout(resolve, 300));

            // ── STEP 3: Screenshot the header/KPIs/chart block ───────────────
            if (!pdfRef.current) {
                throw new Error('El componente PDF no está disponible en el DOM. Intenta de nuevo.');
            }

            const headerCanvas = await html2canvas(pdfRef.current, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true,
            });
            // ── STEP 4: Build PDF document ────────────────────────────────
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const PAGE_W = pdf.internal.pageSize.getWidth();  // 210 mm
            const PAGE_H = pdf.internal.pageSize.getHeight(); // 297 mm
            const MARGIN = 10;
            const CONTENT_W = PAGE_W - MARGIN * 2;

            // Scale header to fit page width and tile across pages if needed
            const headerAspect = headerCanvas.width / headerCanvas.height;
            const headerImgW = CONTENT_W;
            const headerImgH = headerImgW / headerAspect;

            let yPos = MARGIN;
            let heightRemaining = headerImgH;
            let srcY = 0;

            while (heightRemaining > 0) {
                const sliceH = Math.min(PAGE_H - MARGIN * 2, heightRemaining);
                const srcH = (sliceH / headerImgH) * headerCanvas.height;

                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = headerCanvas.width;
                sliceCanvas.height = Math.round(srcH);
                const sliceCtx = sliceCanvas.getContext('2d');
                sliceCtx.drawImage(headerCanvas, 0, srcY, headerCanvas.width, Math.round(srcH), 0, 0, headerCanvas.width, Math.round(srcH));

                const sliceData = sliceCanvas.toDataURL('image/png', 1.0);
                pdf.addImage(sliceData, 'PNG', MARGIN, yPos, headerImgW, sliceH);

                heightRemaining -= sliceH;
                srcY += Math.round(srcH);

                if (heightRemaining > 0) {
                    pdf.addPage();
                    yPos = MARGIN;
                }
            }

            // ── STEP 5: Append savings table with jspdf-autotable ─────────────
            // autoTable handles all page breaks natively — no row is ever cut.
            pdf.addPage();

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(13);
            pdf.setTextColor(16, 185, 129); // emerald-500
            pdf.text('Detalle de Ahorros', MARGIN, MARGIN + 5);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(107, 114, 128);
            pdf.text(
                `Socio: ${profile.name} ${profile.surname1 || ''} · ${filteredSavings.length} registros`,
                MARGIN, MARGIN + 11
            );

            const tableBody = filteredSavings.map((item, idx) => [
                String(idx + 1),
                item.date ? new Date(item.date).toLocaleDateString('es-CA') : 'N/A',
                `${item.month || '—'} ${item.year || ''}`.trim(),
                item.status || '—',
                `$${Number(item.valorAhorrado || item.amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`,
                item.valorAPenalizar > 0
                    ? `$${Number(item.valorAPenalizar).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
                    : '—',
                item.type || '—',
                item.banco || '—',
            ]);

            autoTable(pdf, {
                startY: MARGIN + 16,
                head: [['#', 'Fecha', 'Periodo', 'Estado', 'Valor Ahorrado', 'Penalizado', 'Tipo', 'Banco']],
                body: tableBody,
                margin: { left: MARGIN, right: MARGIN },
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
                    lineColor: [229, 231, 235],
                    lineWidth: 0.3,
                    overflow: 'linebreak',
                },
                headStyles: {
                    fillColor: [16, 185, 129], // emerald-500
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'left',
                },
                alternateRowStyles: {
                    fillColor: [240, 253, 244], // emerald-50
                },
                bodyStyles: {
                    textColor: [55, 65, 81],
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },
                    1: { cellWidth: 22 },
                    2: { cellWidth: 20 },
                    3: { cellWidth: 24, fontStyle: 'bold' },
                    4: { halign: 'right', fontStyle: 'bold', cellWidth: 28 },
                    5: { halign: 'right', cellWidth: 24 },
                    6: { cellWidth: 'auto' },
                    7: { cellWidth: 'auto' },
                },
                foot: [[
                    '', '', '', 'Totales:',
                    `$${Number(summaryStats.totalAhorrado).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`,
                    summaryStats.totalPenalizado > 0
                        ? `$${Number(summaryStats.totalPenalizado).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
                        : '—',
                    '', '',
                ]],
                footStyles: {
                    fillColor: [209, 250, 229], // emerald-100
                    textColor: [6, 95, 70],     // emerald-900
                    fontStyle: 'bold',
                    fontSize: 9,
                },
                rowPageBreak: 'avoid',
                didDrawPage: (data) => {
                    const pageCount = pdf.internal.getNumberOfPages();
                    const currentPage = data.pageNumber;
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(7);
                    pdf.setTextColor(156, 163, 175);
                    pdf.text(
                        `Credifuturo · Documento Confidencial · Pág. ${currentPage} de ${pageCount}`,
                        PAGE_W / 2,
                        PAGE_H - 5,
                        { align: 'center' }
                    );
                },
            });

            // ── STEP 6: Save ─────────────────────────────────────────────────
            const safeId = profile.customerId || profile.id || 'socio';
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `Informe_Estado_Cuenta_${safeId}_${dateStr}.pdf`;
            pdf.save(fileName);

            toast.success(`Informe PDF "${fileName}" generado exitosamente.`);

        } catch (error) {
            console.error('Error generando PDF:', error);
            if (error.message?.includes('componente PDF')) {
                toast.error(error.message);
            } else if (error.message?.includes('canvas')) {
                toast.error('Error al capturar el gráfico. Asegúrate de que esté completamente cargado e intenta de nuevo.');
            } else {
                toast.error('Ocurrió un error inesperado al generar el PDF. Revisa la consola para más detalles.');
            }
        } finally {
            setIsGeneratingPdf(false);
            setChartImage(null);
        }
    };

    const totalPages = Math.max(1, Math.ceil(filteredSavings.length / ITEMS_PER_PAGE));

    if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Cargando...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <PiggyBank className="h-6 w-6 text-brand-primary" />
                        Mis Ahorros
                     {!user?.name ? '' : `- ${user.name} ${user.surname1 || ''} ${user.surname2 || ''}`.trim()}</h2>
                    <p className="text-gray-500 text-sm">Historial de aportes mensuales</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">

                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border-2 border-gray-200/80 shadow-sm transition-all hover:shadow-lg hover:border-gray-300">
                        <select
                            aria-label="Filtrar por estado del ahorro"
                            className="text-sm font-medium text-gray-700 bg-transparent border-none focus:ring-0 cursor-pointer outline-none p-0"
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <option value="">Todos los Estados</option>
                            {uniqueStatuses.map(status => (<option key={status} value={status.toLowerCase()}>{status}</option>))}
                        </select>
                    </div>
                    <Button variant="secondary" onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Excel</Button>
                    <Button
                        variant="destructive"
                        onClick={handleGeneratePdf}
                        disabled={isGeneratingPdf}
                    >
                        {isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                        {isGeneratingPdf ? 'Generando...' : 'Informe PDF'}
                    </Button>
                    <Button variant="ghost" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                </div>
            </div>

            {/* KPI Row: métricas ejecutivas del comportamiento de ahorro */}
            {savings.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Aporte Mensual Promedio</p>
                                <Calculator className="h-4 w-4 text-emerald-700" />
                            </div>
                            <p className="text-xl font-black text-emerald-800 tabular-nums leading-tight">{fmtCOP(summaryStats.aportePromedio)}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Valor neto promedio en aportes tipo "Mensual"</p>
                        </div>
                    </Card>
                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Aporte Máximo</p>
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                            </div>
                            <p className="text-xl font-black text-emerald-600 tabular-nums leading-tight">{fmtCOP(summaryStats.aporteMaximo)}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">Mayor contribución registrada en el histórico</p>
                        </div>
                    </Card>
                    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Último Aporte</p>
                                <ArrowUpToLine className="h-4 w-4 text-amber-500" />
                            </div>
                            <p className="text-base font-black text-amber-600 leading-tight">{fmtShortDate(summaryStats.ultimoAporte)}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                                {summaryStats.diasDesdeUltimo != null ? `Hace ${summaryStats.diasDesdeUltimo} día(s)` : 'Sin movimientos'}
                            </p>
                        </div>
                    </Card>
                    <Card className={`border shadow-sm hover:shadow-md transition-shadow ${summaryStats.conPenalizacion > 0 ? 'border-amber-200 bg-amber-50/50' : 'border-gray-100'}`}>
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Cumplimiento</p>
                                <Shield className={`h-4 w-4 ${summaryStats.conPenalizacion > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                            </div>
                            <p className={`text-xl font-black tabular-nums leading-tight ${summaryStats.conPenalizacion > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                                {summaryStats.tasaCumplimiento.toFixed(0)}<span className="text-sm font-bold">%</span>
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                                {summaryStats.conPenalizacion > 0
                                    ? `${summaryStats.conPenalizacion} aporte(s) con penalización por mora`
                                    : 'Aportes puntuales sin penalización'}
                            </p>
                        </div>
                    </Card>
                </div>
            )}

            {/* Comparativo bruto vs neto si hay penalizaciones */}
            {savings.length > 0 && summaryStats.totalPenalizado > 0 && (
                <Card className="border border-amber-100 bg-amber-50/30 shadow-sm">
                    <div className="p-4 flex items-start gap-3">
                        <div className="bg-amber-500 rounded-lg p-2 shrink-0">
                            <AlertTriangle className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Capital Bruto Ingresado</p>
                                <p className="text-base font-black text-gray-800 tabular-nums">{fmtCOP(summaryStats.totalBruto)}</p>
                                <p className="text-[9px] text-gray-500">Total recibido antes de penalizaciones</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Penalizaciones Aplicadas</p>
                                <p className="text-base font-black text-amber-700 tabular-nums">− {fmtCOP(summaryStats.totalPenalizado)}</p>
                                <p className="text-[9px] text-amber-700">Descuentos por mora en pago mensual</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Capital Neto Acreditado</p>
                                <p className="text-base font-black text-emerald-700 tabular-nums">{fmtCOP(summaryStats.totalAhorrado)}</p>
                                <p className="text-[9px] text-emerald-600">Suma efectivamente abonada a tu cuenta</p>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Composición de movimientos: donut + lista contextual */}
            {savings.length > 0 && statsByStatus.length > 0 && (() => {
                const enriched = statsByStatus.map((s, i) => ({ ...s, ...classifyMovement(s.status, i) }));
                const totalAbs = enriched.reduce((sum, e) => sum + Math.abs(e.total), 0);
                const totalCreditos = enriched.filter(e => e.kind === 'credito').reduce((s, e) => s + e.total, 0);
                const totalDebitos = enriched.filter(e => e.kind === 'debito').reduce((s, e) => s + Math.abs(e.total), 0);
                return (
                    <Card className="border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <PiggyBank className="h-4 w-4 text-emerald-600" />
                                <h3 className="text-sm font-bold text-gray-700">Composición de Movimientos</h3>
                            </div>
                            <p className="text-[10px] text-gray-500">{summaryStats.numAportes} registro(s){filterStatus ? ' · filtrado' : ''}</p>
                        </div>
                        <div className="p-5 grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
                            {/* Donut */}
                            <div className="lg:col-span-2 flex flex-col items-center">
                                <div style={{ width: '100%', height: 200, position: 'relative' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={enriched.map(e => ({ name: e.label, value: Math.abs(e.total), color: e.accent }))}
                                                dataKey="value" nameKey="name"
                                                cx="50%" cy="50%" innerRadius={56} outerRadius={86} paddingAngle={2}
                                            >
                                                {enriched.map((e, i) => <Cell key={i} fill={e.accent} />)}
                                            </Pie>
                                            <Tooltip formatter={(v) => fmtCOP(v)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Saldo Neto</p>
                                        <p className="text-lg font-black text-gray-800 tabular-nums">{fmtCOP(totalCreditos - totalDebitos)}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 w-full mt-2 text-center">
                                    <div className="bg-emerald-50 rounded-lg py-1.5 px-2">
                                        <p className="text-[9px] uppercase tracking-wide text-emerald-700 font-bold">Créditos</p>
                                        <p className="text-xs font-bold text-emerald-700 tabular-nums">+ {fmtCOP(totalCreditos)}</p>
                                    </div>
                                    <div className={`${totalDebitos > 0 ? 'bg-amber-50' : 'bg-gray-50'} rounded-lg py-1.5 px-2`}>
                                        <p className={`text-[9px] uppercase tracking-wide font-bold ${totalDebitos > 0 ? 'text-amber-800' : 'text-gray-500'}`}>Débitos</p>
                                        <p className={`text-xs font-bold tabular-nums ${totalDebitos > 0 ? 'text-amber-800' : 'text-gray-500'}`}>− {fmtCOP(totalDebitos)}</p>
                                    </div>
                                </div>
                            </div>
                            {/* Lista de movimientos */}
                            <div className="lg:col-span-3 space-y-3">
                                {enriched.map((e) => {
                                    const pct = totalAbs > 0 ? (Math.abs(e.total) / totalAbs) * 100 : 0;
                                    const sign = e.kind === 'debito' ? '−' : '+';
                                    return (
                                        <div key={e.status} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50 transition-colors">
                                            <div className="flex items-start justify-between gap-3 mb-1.5">
                                                <div className="flex items-start gap-2.5 min-w-0">
                                                    <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: e.accent }} />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-800 leading-tight">{e.label}</p>
                                                        <p className="text-[10px] text-gray-400 mt-0.5">{e.count} {e.count === 1 ? 'movimiento' : 'movimientos'}{e.label !== e.status ? ` · "${e.status}"` : ''}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-sm font-black tabular-nums" style={{ color: e.accent }}>
                                                        {sign} {fmtCOP(Math.abs(e.total))}
                                                    </p>
                                                    <p className="text-[10px] text-gray-400 tabular-nums">{pct.toFixed(0)}% del flujo</p>
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden mb-1.5">
                                                <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: e.accent }} />
                                            </div>
                                            <p className="text-[10px] text-gray-500 leading-snug">{e.desc}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Card>
                );
            })()}

            {/* Gráfico de Evolución */}
            <div ref={chartRef} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Evolución de Ahorros por Año</h3>
                {savingsByYear.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={savingsByYear} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} />
                            <YAxis tickFormatter={(value) => value > 0 ? `$${(value / 1000000).toFixed(1)}M` : '$0'} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                            <Tooltip formatter={(value) => [`$${Number(value).toLocaleString('es-CO')}`, "Ahorros"]} cursor={{ fill: 'rgba(130, 202, 157, 0.1)' }} />
                            <Bar dataKey="ahorros" fill="#166534" radius={[4, 4, 0, 0]}>
                                <LabelList dataKey="ahorros" position="top" fill="#052e16" fontSize={10} fontWeight="bold" formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : <p className="text-center text-gray-500 py-10">No hay suficientes datos para mostrar el gráfico.</p>}
            </div>

            {/* Métricas económicas: penalización vs rendimiento */}
            {savings.length > 0 && (economics.costoPenalizacionPct > 0 || economics.rendimientoImplicitoTotal > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {economics.costoPenalizacionPct > 0 && (
                        <Card className="border border-amber-100 shadow-sm bg-gradient-to-br from-amber-50/40 to-white">
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Costo Financiero · Penalizaciones</p>
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                </div>
                                <p className="text-2xl font-black text-amber-700 tabular-nums leading-tight">
                                    {economics.costoPenalizacionPct.toFixed(2)}<span className="text-base">%</span>
                                </p>
                                <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                    Del capital bruto ingresado se descontó {fmtCOP(summaryStats.totalPenalizado)} por mora.
                                    Cada punto porcentual representa dinero que no se acreditó a tu ahorro.
                                </p>
                            </div>
                        </Card>
                    )}
                    {economics.rendimientoImplicitoTotal > 0 && (
                        <Card className="border border-emerald-100 shadow-sm bg-gradient-to-br from-emerald-50/40 to-white">
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Rendimiento Acreditado</p>
                                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                                </div>
                                <p className="text-2xl font-black text-emerald-600 tabular-nums leading-tight">
                                    {fmtCOP(economics.rendimientoImplicitoTotal)}
                                </p>
                                <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                                    Equivale a un <span className="font-bold">{economics.rendimientoPct.toFixed(2)}%</span> sobre tu capital aportado neto.
                                    Son intereses distribuidos por el fondo, no aportes propios.
                                </p>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* Tendencia mensual de los últimos 12 meses */}
            {monthlyTrend.length > 1 && (
                <Card className="border border-gray-100 shadow-sm">
                    <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-emerald-600" />
                            <h3 className="text-sm font-bold text-gray-700">Tendencia Mensual · últimos {monthlyTrend.length} meses</h3>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                            <span className="flex items-center gap-1 text-gray-500">
                                <span className="w-3 h-0.5 bg-gray-400" style={{ borderTop: '1px dashed #94a3b8', backgroundColor: 'transparent' }} />
                                Promedio: <span className="font-bold tabular-nums text-gray-700">{fmtCOP(trendStats.avg)}</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded font-bold ${trendStats.deltaPct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                                Último mes: {trendStats.deltaPct >= 0 ? '+' : ''}{trendStats.deltaPct.toFixed(0)}% vs promedio
                            </span>
                        </div>
                    </div>
                    <div className="p-5" style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={monthlyTrend} margin={{ top: 28, right: 24, left: 8, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={52} />
                                <Tooltip
                                    formatter={(v) => fmtCOP(v)}
                                    labelFormatter={(label) => `Mes ${label}`}
                                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                                />
                                <ReferenceLine y={trendStats.avg} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Promedio', position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }} />
                                <Line type="monotone" dataKey="valor" stroke="#166534" strokeWidth={2.5} dot={{ fill: '#166534', r: 4 }} activeDot={{ r: 6 }}>
                                    <LabelList
                                        dataKey="valor"
                                        position="top"
                                        offset={10}
                                        style={{ fill: '#166534', fontSize: 10, fontWeight: 700 }}
                                        formatter={(v) => fmtCOP(v)}
                                    />
                                </Line>
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="px-5 pb-4 text-[10px] text-gray-500">
                        Capital neto acreditado mes a mes. La línea punteada representa tu promedio del periodo: te ayuda a identificar si tu ritmo de ahorro está mejorando o decayendo.
                    </div>
                </Card>
            )}

            {filteredSavings.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No tienes ahorros registrados.</p>
                </CardContent></Card>
            ) : (() => {
                // Enriquecer páginadas: delta vs registro previo cronológico + acumulado neto
                const chronological = [...filteredSavings].sort((a, b) => {
                    const da = a.date ? new Date(a.date).getTime() : 0;
                    const db = b.date ? new Date(b.date).getTime() : 0;
                    return da - db;
                });
                let acumNeto = 0;
                const acumMap = {};
                const deltaMap = {};
                let prevValor = null;
                chronological.forEach(s => {
                    const val = parseFloat(s.valorAhorrado || s.amount || 0);
                    acumNeto += val;
                    acumMap[s.id] = acumNeto;
                    deltaMap[s.id] = prevValor != null ? val - prevValor : null;
                    prevValor = val;
                });
                const enriched = paginatedSavings.map(s => ({
                    ...s,
                    delta: deltaMap[s.id],
                    acumulado: acumMap[s.id]
                }));
                // Totales del set filtrado completo (no solo página actual)
                const totals = filteredSavings.reduce((a, r) => ({
                    amount: a.amount + parseFloat(r.amount || 0),
                    valorAhorrado: a.valorAhorrado + parseFloat(r.valorAhorrado || r.amount || 0),
                    valorAPenalizar: a.valorAPenalizar + parseFloat(r.valorAPenalizar || 0),
                }), { amount: 0, valorAhorrado: 0, valorAPenalizar: 0 });
                return (
                <Card className="overflow-hidden border border-gray-100 shadow-sm">
                    <div className="table-container max-h-[70vh] overflow-y-auto">
                        <table className="premium-table">
                            <thead>
                                <tr className="bg-emerald-700 text-white">
                                    {TABLE_COLUMNS.map(col => (
                                        <th key={col.key} className="sticky top-0 z-10 bg-emerald-700" style={{ textAlign: col.align, minWidth: col.minWidth }}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {enriched.map((saving, idx) => {
                                    const tieneDescuento = parseFloat(saving.valorAPenalizar || 0) > 0;
                                    return (
                                        <tr key={saving.id} className={`transition-colors duration-150 ${tieneDescuento ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                            {TABLE_COLUMNS.map(col => (
                                                <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                    <CellValue column={col} value={saving[col.key]} row={saving} />
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-200 sticky bottom-0">
                                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest" colSpan={4}>Totales · {filteredSavings.length} mov.{filterStatus ? ' (filtrado)' : ''}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">${totals.amount.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800">${totals.valorAhorrado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">{totals.valorAPenalizar > 0 ? `−$${totals.valorAPenalizar.toLocaleString('es-CO', { minimumFractionDigits: 0 })}` : '—'}</td>
                                    <td className="px-3 py-2" colSpan={5}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4 p-4 border-t border-gray-100">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                            </Button>
                            <span className="text-sm text-gray-600 font-medium">
                                Página{' '}
                                <span className="font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-md">
                                    {currentPage}
                                </span>
                                {' '}de {totalPages}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    )}
                </Card>
                );
            })()}

            {/* Componente oculto para la generación del PDF */}
            {isGeneratingPdf && (
                <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
                    <SavingsListPDF
                        ref={pdfRef}
                        user={profile}
                        savings={filteredSavings}
                        stats={summaryStats}
                        chartImage={chartImage}
                        generationDate={new Date()}
                    />
                </div>
            )}
        </div>
    );
};

export default UserSavingsListPage;