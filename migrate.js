const fs = require('fs');

let userPage = fs.readFileSync('Credifuturo-Web/client/src/pages/user/UserLoanAnalyzerPage.jsx', 'utf8');

// 1. Fix the table logic in userPage
const tableFind = `                            {/* Loans table */}
                            {analysis.prestamosVigentes.length > 0 && (
                                <div className="mt-6">`;
const tableRepl = `                            {/* Loans table */}
                            <div className="mt-6">
                                {analysis.prestamosVigentes?.length > 0 ? (
                                    <>`;

userPage = userPage.replace(tableFind, tableRepl);

const tableFind2 = `                                    <p className="text-[9px] text-gray-400 mt-1.5 italic">
                                        * Saldo Pendiente = balance real (saldo inicial próxima cuota). Val. Cuotas Pend. = suma cuotas × intereses por pagar.
                                    </p>
                                </div>
                            )}`;
const tableRepl2 = `                                    <p className="text-[9px] text-gray-400 mt-1.5 italic">
                                        * Saldo Pendiente = balance real (saldo inicial próxima cuota). Val. Cuotas Pend. = suma cuotas × intereses por pagar.
                                    </p>
                                    </>
                                ) : (
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center mt-2">
                                        <p className="text-sm font-medium text-gray-500">No hay préstamos con cuotas pendientes en este momento.</p>
                                    </div>
                                )}
                            </div>`;

userPage = userPage.replace(tableFind2, tableRepl2);

fs.writeFileSync('Credifuturo-Web/client/src/pages/user/UserLoanAnalyzerPage.jsx', userPage);
console.log('Fixed UserLoanAnalyzerPage.jsx');

// 2. Build Admin Page
let adminPage = userPage.replace('const UserLoanAnalyzerPage = () => {', 
`const SocioSelect = ({ clients, selectedId, onSelect }) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const ref = React.useRef(null);

    React.useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = clients.filter(c => {
        const full = \`\${c.name || ''} \${c.surname1 || ''} \${c.surname2 || ''} \${c.cedula || ''}\`.toLowerCase();
        return full.includes(search.toLowerCase());
    });

    const selected = clients.find(c => String(c.id) === String(selectedId));
    const label = selected
        ? \`\${selected.name} \${selected.surname1 || ''} \${selected.surname2 || ''}\`.trim()
        : 'Socio: Seleccionar...';

    return (
        <div className="relative w-full" ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setSearch(''); }}
                className={\`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-left \${selectedId ? 'bg-brand-primary/10 border-brand-primary/40' : 'bg-emerald-50 border-emerald-200'}\`}
            >
                <Users className={\`h-4 w-4 flex-shrink-0 \${selectedId ? 'text-brand-primary' : 'text-emerald-600'}\`} />
                <span className={\`flex-1 text-sm font-semibold truncate \${selectedId ? 'text-gray-800' : 'text-gray-500'}\`}>{label}</span>
                {selected && (
                    <span className="text-[10px] font-bold text-brand-primary/70 bg-brand-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {selected.customerId || \`CC \${selected.cedula}\`}
                    </span>
                )}
                <ChevronDown className={\`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 \${open ? 'rotate-180' : ''}\`} />
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
                            const fullName = \`\${c.name || ''} \${c.surname1 || ''} \${c.surname2 || ''}\`.trim();
                            const isActive = String(c.id) === String(selectedId);
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { onSelect(String(c.id)); setOpen(false); setSearch(''); }}
                                    className={\`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors \${isActive ? 'bg-brand-primary/10' : 'hover:bg-gray-50'}\`}
                                >
                                    <div className={\`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black \${isActive ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-500'}\`}>
                                        {(c.name || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={\`text-sm font-bold truncate \${isActive ? 'text-brand-primary' : 'text-gray-800'}\`}>{fullName}</p>
                                        <p className="text-[10px] text-gray-400 font-mono">{c.customerId || ''}{c.cedula ? \` · C.C. \${c.cedula}\` : ''}</p>
                                    </div>
                                    {isActive && <CheckCircle className="h-4 w-4 text-brand-primary flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const LoanAnalyzerPage = () => {`);

adminPage = adminPage.replace("import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect, useRef } from 'react';");
adminPage = adminPage.replace("} from 'lucide-react';", ", Users, Search, ChevronDown, X } from 'lucide-react';");
adminPage = adminPage.replace("export default UserLoanAnalyzerPage;", "export default LoanAnalyzerPage;");

adminPage = adminPage.replace(
`    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    const { toast } = useUi();
    const [analysis, setAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(true);`,
`    const { toast } = useUi();
    const [clients, setClients] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    useEffect(() => {
        const fetchClients = async () => {
            try {
                const res = await api.get('/admin/socios');
                setClients(res.data.filter(c => c.role !== 'admin' && c.role !== 'root'));
            } catch (err) {
                console.error(err);
                toast.error('Error al cargar socios.');
            }
        };
        fetchClients();
    }, [toast]);`
);

adminPage = adminPage.replace(
`    useEffect(() => {
        const fetchAnalysis = async () => {
            setLoadingAnalysis(true);
            try {
                const res = await api.get('/admin/my/loan-capacity');
                setAnalysis(res.data);
            } catch (err) {
                console.error(err);
                toast.error('Error al cargar análisis de capacidad.');
            } finally {
                setLoadingAnalysis(false);
            }
        };
        fetchAnalysis();
    }, [toast]);`,
`    useEffect(() => {
        if (!selectedId) {
            setAnalysis(null);
            return;
        }
        const fetchAnalysis = async () => {
            setLoadingAnalysis(true);
            try {
                const res = await api.get(\`/admin/socios/\${selectedId}/loan-capacity\`);
                setAnalysis(res.data);
            } catch (err) {
                console.error(err);
                toast.error('Error al cargar análisis de capacidad.');
            } finally {
                setLoadingAnalysis(false);
            }
        };
        fetchAnalysis();
    }, [selectedId, toast]);`
);

adminPage = adminPage.replace(`const v = calcVerdict(analysis, { audience: 'user' });`, `const v = calcVerdict(analysis, { audience: 'admin' });`);

adminPage = adminPage.replace(
`            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                    <Scale className="h-6 w-6 text-emerald-600" />
                    Mi Capacidad de Préstamo
                 {!user?.name ? '' : \`- \${user.name} \${user.surname1 || ''} \${user.surname2 || ''}\`.trim()}</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Evaluación financiera personal · Basada en la regla de 3× Ahorro Acumulado
                </p>
            </div>`,
`            {/* Page header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
                        <Scale className="h-6 w-6 text-emerald-600" />
                        Analizador de Capacidad de Préstamo
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Evaluación financiera experta · Regla 3× Ahorro Acumulado · Sin mínimo requerido
                    </p>
                </div>
                <div className="w-full md:w-80">
                    <SocioSelect clients={clients} selectedId={selectedId} onSelect={setSelectedId} />
                </div>
            </div>`
);

adminPage = adminPage.replace(
`                <div className="p-5 space-y-5">
                    {/* Loading */}
                    {loadingAnalysis && (`,
`                <div className="p-5 space-y-5">
                    {/* Empty state (no user selected) */}
                    {!selectedId && !loadingAnalysis && (
                        <div className="text-center py-12 text-gray-400">
                            <TrendingDown className="h-12 w-12 mx-auto mb-3 opacity-25" />
                            <p className="text-sm font-medium">Selecciona un socio para ver el análisis de capacidad</p>
                            <p className="text-xs mt-1">Basado en regla de 3× el ahorro acumulado</p>
                        </div>
                    )}

                    {/* Loading */}
                    {loadingAnalysis && (`
);

adminPage = adminPage.replace(`{analysis && v && !loadingAnalysis && (`, `{selectedId && analysis && v && !loadingAnalysis && (`);

fs.writeFileSync('Credifuturo-Web/client/src/pages/admin/LoanAnalyzerPage.jsx', adminPage);
console.log('Fixed LoanAnalyzerPage.jsx');
