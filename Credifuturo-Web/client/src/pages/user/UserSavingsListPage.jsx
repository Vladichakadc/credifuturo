import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../config/api';
import { Search, RefreshCw, PiggyBank, Inbox, Download, ChevronLeft, ChevronRight, FileDown, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useUi } from '../../context/UiContext';
import * as XLSX from 'xlsx';
import { formatDate } from '../../utils/excelUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import html2canvas from 'html2canvas';
import SavingsListPDF from './SavingsListPDF'; // Nuevo componente para el PDF

const TABLE_COLUMNS = [
    { key: 'externalId', label: 'Id_VM', align: 'center', minWidth: '100px', highlight: true },
    { key: 'status', label: 'Estado', align: 'center', minWidth: '130px', isTypeBadge: true },
    { key: 'date', label: 'Fecha Pago', align: 'center', minWidth: '130px', isDate: true },
    { key: 'month', label: 'Mes pago', align: 'center', minWidth: '110px' },
    { key: 'year', label: 'Año', align: 'center', minWidth: '80px' },
    { key: 'amount', label: 'Valor Mensual', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'valorAhorrado', label: 'Valor Ahorrado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'penalizacion', label: 'Penalización', align: 'center', minWidth: '120px', isPenBadge: true },
    { key: 'valorAPenalizar', label: 'Valor Penalizado', align: 'right', minWidth: '130px', isCurrency: true },
    { key: 'type', label: 'Tipo', align: 'center', minWidth: '130px' },
    { key: 'banco', label: 'Banco', align: 'left', minWidth: '140px' },
    { key: 'observaciones', label: 'Observaciones', align: 'left', minWidth: '200px' },
];

const ITEMS_PER_PAGE = 15;

const TypeBadge = ({ value }) => {
    if (!value) return <span className="text-gray-300 text-xs italic">—</span>;
    const normalized = value.trim();
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
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${isSI ? 'bg-orange-100 text-orange-800 ring-orange-200' : 'bg-emerald-100 text-emerald-800 ring-emerald-200'}`}>
            {value}
        </span>
    );
};

const CellValue = ({ column, value }) => {
    if (column.isTypeBadge) return <TypeBadge value={value} />;
    if (column.isPenBadge) return <PenBadge value={value} />;
    if (column.isDate) return <span className="tabular-nums text-gray-700">{formatDate(value)}</span>;
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 text-xs italic">—</span>;
    if (column.isCurrency) {
        const num = parseFloat(value);
        return <span className="font-medium text-gray-900 tabular-nums">${!isNaN(num) ? num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</span>;
    }
    if (column.highlight) return <span className="font-semibold text-gray-900">{value}</span>;
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
    const [searchTerm, setSearchTerm] = useState('');
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
        const totalPenalizado = filteredSavings.reduce((acc, curr) => acc + parseFloat(curr.valorAPenalizar || 0), 0);
        const numAportes = filteredSavings.length;
        return {
            totalAhorrado,
            totalPenalizado,
            numAportes,
        };
    }, [filteredSavings]);

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
            const headerImgData = headerCanvas.toDataURL('image/png', 1.0);

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
                     {!user?.nombre ? '' : `- ${user.nombre} ${user.apellido || ''}`.trim()}</h2>
                    <p className="text-gray-500 text-sm">Historial de aportes mensuales</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border-2 border-gray-200/80 shadow-sm transition-all hover:shadow-lg hover:border-gray-300 flex-1 lg:w-48">
                        <Search className="h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-800 placeholder:text-gray-400 p-0"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border-2 border-gray-200/80 shadow-sm transition-all hover:shadow-lg hover:border-gray-300">
                        <select
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

            {/* Tarjeta de Suma Total */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-emerald-50/50 border-emerald-100">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-emerald-800">Suma Valor Ahorrado</CardTitle>
                        <PiggyBank className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-900">${summaryStats.totalAhorrado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</div>
                        <p className="text-xs text-emerald-600 mt-1">Total acumulado en pantalla</p>
                    </CardContent>
                </Card>
            </div>

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
                            <Bar dataKey="ahorros" fill="#22c55e" radius={[4, 4, 0, 0]}>
                                <LabelList dataKey="ahorros" position="top" fill="#15803d" fontSize={10} fontWeight="bold" formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : <p className="text-center text-gray-500 py-10">No hay suficientes datos para mostrar el gráfico.</p>}
            </div>

            {filteredSavings.length === 0 ? (
                <Card><CardContent className="p-12 text-center">
                    <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No tienes ahorros registrados.</p>
                </CardContent></Card>
            ) : (
                <Card className="overflow-hidden border-none shadow-none bg-transparent">
                    <div className="table-container max-h-[70vh] overflow-y-auto">
                        <table className="premium-table">
                            <thead>
                                <tr className="bg-brand-primary text-white">
                                    {TABLE_COLUMNS.map(col => (
                                        <th key={col.key} className="sticky top-0 z-10 bg-brand-primary" style={{ textAlign: col.align, minWidth: col.minWidth }}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedSavings.map((saving, idx) => (
                                    <tr key={saving.id} className={`transition-colors duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'} hover:bg-emerald-50`}>
                                        {TABLE_COLUMNS.map(col => (
                                            <td key={col.key} style={{ textAlign: col.align, minWidth: col.minWidth }}>
                                                <CellValue column={col} value={saving[col.key]} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
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
            )}

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