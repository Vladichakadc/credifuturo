import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PiggyBank, CreditCard, DollarSign, User, Activity, Wallet } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { TrendingUp, ShieldCheck, ActivitySquare, AlertCircle } from 'lucide-react';

const StatCard = ({ title, value, description, icon: Icon, color, isDark = false, textColor }) => (
    <Card className="transition-all duration-200 overflow-hidden relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-gray-500'}`}>{title}</CardTitle>
            <Icon className={`h-4 w-4 ${color}`} />
        </CardHeader>
        <CardContent className="relative z-10">
            <div className={`text-2xl font-bold ${textColor || (isDark ? 'text-white' : 'text-gray-900')}`}>{value}</div>
            <p className={`text-xs mt-1 ${isDark ? 'text-white/80' : 'text-gray-500'}`}>{description}</p>
        </CardContent>
    </Card>
);

const BusinessIntelligenceDashboard = ({ balance, savingsData }) => {
    if (!balance || !savingsData) return null;

    const totalSavings = Number(balance.totalSavings || 0);
    const debt = Number(balance.debt || 0);
    const totalVolume = totalSavings + debt;

    const pieData = [
        { name: 'Capital Ahorrado', value: totalSavings, color: '#10b981' }, 
        { name: 'Cartera Activa', value: debt, color: '#ef4444' }      
    ].filter(d => d.value > 0);

    // Cálculos de Inteligencia de Negocios
    const solvencyRatio = debt === 0 ? 100 : ((totalSavings / debt) * 100);
    const isSolid = totalSavings >= debt;

    let growthText = "Sin datos suficientes";
    let growthIcon = <ActivitySquare className="h-5 w-5 text-gray-400" />;
    let growthColor = "text-gray-600";

    if (savingsData.length >= 2) {
        const sortedData = [...savingsData].sort((a, b) => b.year - a.year);
        const lastYear = sortedData[0].ahorros;
        const previousYear = sortedData[1].ahorros;
        if (previousYear > 0) {
            const growth = ((lastYear - previousYear) / previousYear) * 100;
            if (growth > 0) {
                growthText = `+${growth.toFixed(1)}% vs anterior`;
                growthIcon = <TrendingUp className="h-5 w-5 text-emerald-500" />;
                growthColor = "text-emerald-600";
            } else {
                growthText = `${growth.toFixed(1)}% vs anterior`;
                growthIcon = <TrendingUp className="h-5 w-5 text-red-500 rotate-180" />;
                growthColor = "text-red-600";
            }
        }
    } else if (savingsData.length === 1) {
        growthText = "Primer año de ahorro activo";
        growthIcon = <TrendingUp className="h-5 w-5 text-emerald-500" />;
        growthColor = "text-emerald-600";
    }

    const CustomPieTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const percentage = ((data.value / totalVolume) * 100).toFixed(1);
            return (
                <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                    <p className="text-sm font-bold text-gray-800 mb-1">{data.name}</p>
                    <p className="text-sm font-mono text-gray-900">
                        Valor: <span className="font-bold flex-1 text-right" style={{ color: data.color }}>${Number(data.value).toLocaleString('es-CO')}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Representa el {percentage}% del volumen financiero</p>
                </div>
            );
        }
        return null;
    };

    const CustomBarTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                    <p className="text-sm font-bold text-gray-800 mb-1">Año {label}</p>
                    <p className="text-sm font-mono text-gray-900">
                        Total Ahorrado: <span className="font-bold text-emerald-600">${Number(payload[0].value).toLocaleString('es-CO')}</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card className="mt-8 overflow-hidden bg-gradient-to-br from-white to-gray-50/50 shadow-md">
            <CardHeader className="border-b border-gray-100 bg-white/50 pb-4">
                <CardTitle className="text-xl flex items-center gap-2 text-gray-900">
                    <ActivitySquare className="h-5 w-5 text-brand-primary" />
                    Análisis Financiero Inteligente
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">Métricas clave y comportamiento histórico de tu portafolio</p>
            </CardHeader>
            <CardContent className="p-0">
                {/* Insights Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100 border-b border-gray-100 bg-white">
                    <div className="p-5 flex items-start gap-4">
                        <div className="bg-emerald-50 p-2.5 rounded-lg flex-shrink-0">
                            <DollarSign className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div className="w-full">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Volumen Total</p>
                            <p className="text-2xl font-bold text-gray-900 font-mono">${Number(totalVolume).toLocaleString('es-CO')}</p>
                            <div className="mt-2 space-y-1.5 border-t border-emerald-100 pt-2 w-full pr-4">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Activos (Ahorro)
                                    </span>
                                    <span className="font-semibold text-emerald-700">${Number(totalSavings).toLocaleString('es-CO')}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                        Pasivos (Deuda)
                                    </span>
                                    <span className="font-semibold text-red-700">${Number(debt).toLocaleString('es-CO')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 flex items-start gap-4">
                        <div className={`p-2.5 rounded-lg flex-shrink-0 ${isSolid ? 'bg-blue-50' : 'bg-amber-50'}`}>
                            {isSolid ? <ShieldCheck className="h-6 w-6 text-blue-600" /> : <AlertCircle className="h-6 w-6 text-amber-600" />}
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Índice de Solidez</p>
                            <p className="text-2xl font-bold text-gray-900">{solvencyRatio > 999 ? '>999' : solvencyRatio.toFixed(1)}<span className="text-lg text-gray-500 ml-0.5">%</span></p>
                            <p className="text-xs text-gray-500 mt-1">{isSolid ? 'Cobertura total de deuda' : 'Deuda supera el ahorro'}</p>
                        </div>
                    </div>
                    <div className="p-5 flex items-start gap-4">
                        <div className="bg-gray-50 p-2.5 rounded-lg flex-shrink-0">
                            {growthIcon}
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tendencia de Ahorro</p>
                            <p className={`text-xl font-bold ${growthColor}`}>{growthText}</p>
                            <p className="text-xs text-gray-500 mt-1.5">Variación interanual</p>
                        </div>
                    </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                    
                    {/* Left Chart: Distribución */}
                    <div className="p-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-6 text-center">Distribución de Capital</h3>
                        {totalVolume === 0 ? (
                            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">Sin datos financieros para graficar</div>
                        ) : (
                            <div className="h-[260px] w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={95}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomPieTooltip />} />
                                        <Legend 
                                            verticalAlign="bottom" 
                                            height={30} 
                                            iconType="circle" 
                                            wrapperStyle={{ fontSize: '12px', fontWeight: '500', color: '#4b5563' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                {/* Center metric */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-[-15px]">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Activos</span>
                                    <span className="text-lg font-bold text-gray-800">{((totalSavings / totalVolume) * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Chart: Histórico de Ahorro */}
                    <div className="p-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-6 text-center">Evolución de Ahorros por Año</h3>
                        {savingsData.length === 0 ? (
                            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">Sin historial de ahorros</div>
                        ) : (
                            <div className="h-[260px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={savingsData} margin={{ top: 25, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="barGradBI" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#10b981" />
                                                <stop offset="100%" stopColor="#059669" />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }} dy={6} />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#9ca3af', fontSize: 11 }}
                                            tickFormatter={(value) => `$${value >= 1000000 ? (value/1000000).toFixed(1) + 'M' : value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                                        />
                                        <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }} />
                                        <Bar dataKey="ahorros" fill="url(#barGradBI)" radius={[6, 6, 0, 0]} maxBarSize={45} animationDuration={1500} animationEasing="ease-out">
                                            <LabelList dataKey="ahorros" position="top" style={{ fill: '#374151', fontSize: 10, fontWeight: 700 }} formatter={(v) => `$${Number(v).toLocaleString('es-CO')}`} offset={8} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const UserDashboardHome = () => {
    const { toast } = useUi();
    const [profile, setProfile] = useState(null);
    const [balance, setBalance] = useState({ balance: 0, debt: 0, totalSavings: 0 });
    const [savingsData, setSavingsData] = useState([]);
    const [detailedSavings, setDetailedSavings] = useState({ mensuales: 0, aportes: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [profileRes, balanceRes, savingsRes, initContribRes] = await Promise.all([
                    api.get('/admin/my/profile'),
                    api.get('/admin/my/balance'),
                    api.get('/admin/my/savings'),
                    api.get('/admin/my/initial-contributions')
                ]);
                setProfile(profileRes.data);
                setBalance(balanceRes.data);

                const savingsArr = savingsRes.data?.data || [];
                const contribArr = initContribRes.data?.data || [];
                
                const mensuales = savingsArr.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
                const aportes = contribArr.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
                setDetailedSavings({ mensuales, aportes });

                const allSavings = [...savingsArr, ...contribArr];
                
                const savingsByYear = allSavings.reduce((acc, curr) => {
                    const year = curr.date ? new Date(curr.date).getFullYear() : 'Desconocido';
                    if (!acc[year]) acc[year] = 0;
                    acc[year] += parseFloat(curr.amount || 0);
                    return acc;
                }, {});

                const chartData = Object.keys(savingsByYear)
                    .filter(year => year !== 'Desconocido' && !isNaN(year))
                    .sort()
                    .map(year => ({
                        year: year.toString(),
                        ahorros: savingsByYear[year]
                    }));
                
                setSavingsData(chartData);

            } catch (err) {
                console.error('Error fetching dashboard data:', err);
                toast.error('Error al cargar la información del panel.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [toast]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="grid gap-4 md:grid-cols-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Bienvenido, {profile?.name}</h1>
                <p className="text-gray-500 mt-1">Aquí puedes consultar el estado de tus cuentas e historial.</p>
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                <StatCard
                    title="Ahorro Mensual"
                    value={`$${Number(detailedSavings.mensuales).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`}
                    description="Suma ahorros regulares"
                    icon={PiggyBank}
                    color="text-emerald-500"
                />
                <StatCard
                    title="Aportes Totales"
                    value={`$${Number(detailedSavings.aportes).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`}
                    description="Suma aportes iniciales"
                    icon={Wallet}
                    color="text-blue-500"
                />
                <StatCard
                    title="Ahorro Total"
                    value={`$${Number(balance.totalSavings || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`}
                    description="Ahorro + Aportes"
                    icon={DollarSign}
                    color="text-brand-primary"
                />
                <StatCard
                    title="Cartera Activa"
                    value={`$${Number(balance.debt || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`}
                    description="Suma cuotas pendientes"
                    icon={CreditCard}
                    color="text-red-500"
                />
                <StatCard
                    title="Estado Cuenta"
                    value={profile?.estatus || 'Activo'}
                    description={`Desde ${profile?.fechaIngreso || 'N/A'}`}
                    icon={Activity}
                    color="text-purple-500"
                />
            </div>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <User className="h-5 w-5 text-brand-primary" />
                        Detalle de Perfil
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-gray-500">Nombre Completo</p>
                                <p className="font-medium text-gray-900">{profile?.name} {profile?.surname1} {profile?.surname2}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Cédula</p>
                                <p className="font-medium text-gray-900">{profile?.cedula}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Correo Electrónico</p>
                                <p className="font-medium text-gray-900">{profile?.email}</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-gray-500">Código de Socio</p>
                                <p className="font-medium text-gray-900">{profile?.customerId}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">País / Ciudad</p>
                                <p className="font-medium text-gray-900">{profile?.pais} - {profile?.ciudad}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Tipo Cliente</p>
                                <p className="font-medium text-gray-900">{profile?.tipoCliente}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <BusinessIntelligenceDashboard balance={balance} savingsData={savingsData} />
        </div>
    );
};

export default UserDashboardHome;
