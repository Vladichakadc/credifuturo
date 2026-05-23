{/* Tabla de Ahorros/Aportes */ }
<div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <h4 className="text-md font-bold text-gray-800 flex items-center">
            <span className="mr-2">📊</span> Lista de Ahorros y Aportes Registrados ({savings.length})
        </h4>
    </div>
    <div className="overflow-x-auto">
        <table className="w-full">
            <thead className="bg-brand-primary text-white text-xs">
                <tr>
                    <th className="px-3 py-2 text-left">ID_VM</th>
                    <th className="px-3 py-2 text-left">Socio</th>
                    <th className="px-3 py-2 text-left">Fecha Pago</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-center">Acciones</th>
                </tr>
            </thead>
            <tbody className="text-sm">
                {savings.length === 0 ? (
                    <tr>
                        <td colSpan="7" className="px-3 py-8 text-center text-gray-400 italic">
                            No hay registros de ahorros/aportes
                        </td>
                    </tr>
                ) : (
                    savings.slice().reverse().map((saving, idx) => (
                        <tr key={saving.id} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <td className="px-3 py-2 font-bold text-brand-primary">{saving.externalId || '-'}</td>
                            <td className="px-3 py-2">{saving.Client?.name || 'N/A'}</td>
                            <td className="px-3 py-2">{saving.date}</td>
                            <td className="px-3 py-2 text-right font-bold">${parseFloat(saving.amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2">{saving.type}</td>
                            <td className="px-3 py-2">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${saving.status === 'Abono' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {saving.status}
                                </span>
                            </td>
                            <td className="px-3 py-2">
                                <div className="flex justify-center gap-2">
                                    <button
                                        onClick={() => {
                                            setNewSaving({
                                                clientId: saving.clientId,
                                                amount: saving.amount,
                                                date: saving.date,
                                                type: saving.type || 'Mensual',
                                                banco: saving.banco || '',
                                                numeroTransaccion: saving.numeroTransaccion || '',
                                                origen: saving.origen || '',
                                                penalizacion: saving.penalizacion || '0',
                                                diasPenalizacion: saving.diasPenalizacion || '0',
                                                valorAhorrado: saving.valorAhorrado || '0',
                                                valorAPenalizar: saving.valorAPenalizar || '0',
                                                mesAbonado: saving.mesAbonado || monthNames[new Date().getMonth()],
                                                anioAbonado: saving.anioAbonado || new Date().getFullYear(),
                                                year: saving.year || new Date().getFullYear(),
                                                month: saving.month || monthNames[new Date().getMonth()],
                                                monthInt: saving.monthInt || new Date().getMonth() + 1,
                                                externalId: saving.externalId || '',
                                                status: saving.status || 'Abono',
                                                itemQuantity: saving.itemQuantity || '1',
                                                observaciones: saving.observaciones || ''
                                            });
                                            setIsEditingSaving(true);
                                            setEditingSavingId(saving.id);
                                            fetchBalance(saving.clientId);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        className="bg-brand-gold text-brand-primary px-3 py-1 rounded text-xs font-bold hover:bg-yellow-500 transition-all duration-200 hover:scale-105"
                                        title="Modificar registro"
                                    >
                                        ✏️ Modificar
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!confirm('¿Estás seguro de eliminar este registro de ahorro? Esta acción no se puede deshacer.')) return;
                                            try {
                                                await axios.delete(`http://localhost:3000/api/admin/savings/${saving.id}`);
                                                alert('Registro eliminado con éxito');
                                                fetchData();
                                            } catch (err) {
                                                alert('Error al eliminar: ' + (err.response?.data?.error || err.message));
                                            }
                                        }}
                                        className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-red-700 transition-all duration-200 hover:scale-105"
                                        title="Eliminar registro"
                                    >
                                        🗑️ Eliminar
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    </div>
</div>
