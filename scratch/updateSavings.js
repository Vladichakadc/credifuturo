const fs = require('fs');
const file = 'c:/Credifuturo/Credifuturo-Web/client/src/pages/user/UserSavingsListPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Insert totalsByStatus
const useMemoSearch = "    const summaryStats = useMemo(() => {\\n        const totalAhorrado = filteredSavings.reduce((acc, curr) => acc + parseFloat(curr.valorAhorrado || curr.amount || 0), 0);\\n        const totalPenalizado = filteredSavings.reduce((acc, curr) => acc + parseFloat(curr.valorAPenalizar || 0), 0);\\n        const numAportes = filteredSavings.length;\\n        return {\\n            totalAhorrado,\\n            totalPenalizado,\\n            numAportes,\\n        };\\n    }, [filteredSavings]);";

const totalsByStatusCode = `
    const totalsByStatus = useMemo(() => {
        const totals = {};
        filteredSavings.forEach(s => {
            const status = s.status ? s.status.trim() : 'Sin Estado';
            if (!totals[status]) totals[status] = 0;
            totals[status] += parseFloat(s.valorAhorrado || s.amount || 0);
        });
        return totals;
    }, [filteredSavings]);
`;
content = content.replace(useMemoSearch, useMemoSearch + "\\n" + totalsByStatusCode);

// 2. Remove search input
const searchInputCode = `                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border-2 border-gray-200/80 shadow-sm transition-all hover:shadow-lg hover:border-gray-300 flex-1 lg:w-48">
                        <Search className="h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-800 placeholder:text-gray-400 p-0"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>`;
content = content.replace(searchInputCode, '');

// 3. Update Cards
const cardsCode = `            {/* Tarjeta de Suma Total */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-emerald-50/50 border-emerald-100">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-emerald-800">Suma Valor Ahorrado</CardTitle>
                        <PiggyBank className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-900">\${summaryStats.totalAhorrado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</div>
                        <p className="text-xs text-emerald-600 mt-1">Total acumulado en pantalla</p>
                    </CardContent>
                </Card>
            </div>`;

const newCardsCode = `            {/* Tarjetas Dinámicas de Totales */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-emerald-50/50 border-emerald-100">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-emerald-800">Suma Valor Ahorrado</CardTitle>
                        <PiggyBank className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-900">\${summaryStats.totalAhorrado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</div>
                        <p className="text-xs text-emerald-600 mt-1">Total global acumulado</p>
                    </CardContent>
                </Card>
                {Object.entries(totalsByStatus).map(([status, total]) => {
                    if (total <= 0) return null;
                    return (
                        <Card key={status} className="bg-blue-50/50 border-blue-100">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium text-blue-800">{status}</CardTitle>
                                <PiggyBank className="h-4 w-4 text-blue-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-900">\${total.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</div>
                                <p className="text-xs text-blue-600 mt-1">Total acumulado en pantalla</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>`;

content = content.replace(cardsCode, newCardsCode);

fs.writeFileSync(file, content);
console.log('Modified UserSavingsListPage.jsx');
