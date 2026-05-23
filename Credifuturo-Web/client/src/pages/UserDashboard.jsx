import { useState, useEffect } from 'react';
import api from '../config/api';
import logo from '../assets/logo.jpg';

const UserDashboard = ({ user }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get(`/user/${user.id}`);
                setData(res.data);
            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setLoading(false);
            }
        };
        if (user?.id) fetchData();
    }, [user]);

    if (loading) return <div className="p-8 text-center">Cargando información...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Error al cargar datos.</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center space-x-4 mb-8">
                <img src={logo} alt="Credifuturo" className="h-16 w-auto object-contain" />
                <h1 className="text-3xl font-bold text-gray-900">Mis Finanzas</h1>
            </div>

            {/* Resumen General */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-brand-primary">
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Ahorrado</dt>
                        <dd className="mt-1 text-3xl font-semibold text-brand-primary">
                            ${data.totalSavings.toLocaleString('es-CO')}
                        </dd>
                        <p className="mt-2 text-sm text-gray-600">Aportes acumulados</p>
                    </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-brand-gold">
                    <div className="px-4 py-5 sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">Préstamos Activos</dt>
                        <dd className="mt-1 text-3xl font-semibold text-brand-dark">
                            {data.loans.filter(l => l.status === 'Approved').length}
                        </dd>
                        <p className="mt-2 text-sm text-gray-600">Créditos vigentes</p>
                    </div>
                </div>
            </div>

            {/* Historial Ahorros */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Historial de Aportes</h3>
                </div>
                <ul className="divide-y divide-gray-200 h-64 overflow-y-auto">
                    {data.savings.map((saving) => (
                        <li key={saving.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-brand-blue truncate">
                                    ${parseFloat(saving.amount).toLocaleString('es-CO')}
                                </p>
                                <div className="ml-2 flex-shrink-0 flex">
                                    <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                        {saving.date}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-2 sm:flex sm:justify-between">
                                <div className="sm:flex">
                                    <p className="flex items-center text-sm text-gray-500">
                                        {saving.type}
                                    </p>
                                </div>
                            </div>
                        </li>
                    ))}
                    {data.savings.length === 0 && <li className="px-4 py-4 text-gray-500">No hay registros de ahorros.</li>}
                </ul>
            </div>

            {/* Préstamos */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Estado de Préstamos</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Propósito</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.loans.map((loan) => (
                                <tr key={loan.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${parseFloat(loan.amount).toLocaleString('es-CO')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {loan.date}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {loan.purpose || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${loan.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                            loan.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                            {loan.status === 'Approved' ? 'Aprobado' : loan.status === 'Pending' ? 'Pendiente' : loan.status === 'Paid' ? 'Pagado' : 'Rechazado'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {data.loans.length === 0 && <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-500">No hay préstamos registrados.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserDashboard;
