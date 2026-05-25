import React from 'react';
import { Scale, CheckCircle, XCircle, Info, FileText } from 'lucide-react';
import { cn } from '../../utils/cn';

const resolutions = [
    {
        id: 1,
        title: 'Aporte Inicial para Nuevos Socios',
        description: 'Para los nuevos socios que deseen ingresar, el valor del aporte inicial se establece en $600.000, el cual deberá pagarse antes de los primeros 10 días del primer mes del año 2026.',
        approved: true,
        votes: { si: 15, no: 0 }
    },
    {
        id: 2,
        title: 'Incentivo de Ahorro y Beneficio en Tasa de Interés',
        description: 'Los asociados que no retiren el total de los ahorros mensuales del 2025 o que conserven al menos el 50% de los mismos, tendrán una disminución en la tasa de interés de los préstamos del 2026. Buscando evitar descapitalizar el fondo para el 2026, se aprueba un beneficio de reducción de 2 puntos % a la tasa del 2026.',
        approved: true,
        votes: { si: 14, no: 2 }
    },
    {
        id: 3,
        title: 'Proyección y Montos de Préstamos',
        description: 'Se establecen los siguientes lineamientos para los montos de préstamos:\n• Sin monto mínimo: no requiere votación.\n• Monto máximo: hasta 3 veces el ahorro acumulado no requiere votación.\n• Si la solicitud es por un monto superior al establecido, se someterá a votación del fondo.',
        approved: true,
        votes: { si: 17, no: 0 }
    },
    {
        id: 4,
        title: 'Condiciones de Inicio de Préstamos',
        description: 'Se aprueba iniciar con el desembolso de préstamos a partir del mes de diciembre del 2025, rigiéndose bajo las condiciones previamente aprobadas.',
        approved: true,
        votes: { si: 14, no: 2 }
    },
    {
        id: 5,
        title: 'Propuesta de Plazos para Pago',
        description: 'Propuesta de plazos según montos:\n• De $1.000.000 a $2.000.000: hasta 3 meses.\n• De $3.000.000 a $5.000.000: hasta 6 meses.\n• De $5.000.000 en adelante: hasta 12 meses.',
        approved: false,
        votes: { si: 4, no: 13 },
        note: 'Esta propuesta fue rechazada en la votación general.'
    },
    {
        id: 6,
        title: 'Política de Devolución de Ahorros y Utilidades',
        description: 'A partir de 2026: únicamente se realizará la devolución de los ahorros adicionales a los $50.000 y las utilidades para fortalecer el fondo.',
        approved: false,
        votes: { si: 4, no: 11 },
        note: 'Esta propuesta fue rechazada en la votación general.'
    },
    {
        id: 7,
        title: 'Incremento en la Tasa de Interés de Préstamos',
        description: 'Propuesta 2026: incrementar 1 Punto % de los intereses de los prestamos a la tasa actual 1,5%.',
        approved: true,
        votes: { si: 10, no: 5 }
    },
    {
        id: 8,
        title: 'Frecuencia de Informes de Cuenta',
        description: 'Se establece el envío de informes de saldos de cuenta y préstamos de manera mensual, manteniendo adicionalmente los informes trimestrales actuales.',
        approved: true,
        votes: { si: 16, no: 0 }
    },
    {
        id: 9,
        title: 'Aumento Anual del Aporte Inicial',
        description: 'Se aprueba aumentar en $100.000 el valor del aporte inicial de cada año. Para el periodo 2026, este incremento deberá ser cancelado antes del 10 de enero.',
        approved: true,
        votes: { si: 16, no: 0 }
    },
    {
        id: 10,
        title: 'Incremento del Aporte Mensual Mínimo',
        description: 'Se establece un incremento en el aporte mensual mínimo a $50.000 por socio, aclarando que cada integrante tiene la libertad de ahorrar montos superiores a este valor.',
        approved: true,
        votes: { si: 17, no: 0 }
    },
    {
        id: 11,
        title: 'Cambio de Administración y Tesorería',
        description: 'Se aprueba el traslado de la cuenta de ahorro actual (de Doris) a la cuenta de NU de Xiomara. Asimismo, se oficializa la creación del cargo de Tesorera dentro de la estructura del fondo.',
        approved: true,
        votes: { si: 16, no: 0 }
    },
    {
        id: 12,
        title: 'Préstamos Mayores a 12 Cuotas',
        description: 'Se aprueban los préstamos mayores a 12 cuotas (que superen el 31 de diciembre), con el requisito de no retirar los ahorros.',
        approved: true,
        votes: { si: 16, no: 0 }
    },
    {
        id: 13,
        title: 'Préstamos para Socios Nuevos',
        description: 'Los socios nuevos podrán solicitar préstamos a partir del mes 3.',
        approved: true,
        votes: { si: 14, no: 3 }
    },
    {
        id: 14,
        title: 'Capital Mínimo en el Fondo',
        description: 'Siempre debe quedar mínimo el 20% de capital en el fondo.',
        approved: true,
        votes: { si: 17, no: 0 }
    }
];

const UserResolutionsPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-brand-primary/10 rounded-lg">
                        <FileText className="h-6 w-6 text-brand-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Resoluciones y Acuerdos 2025-2026 {!user?.nombre ? '' : `- ${user.nombre} ${user.apellido || ''}`.trim()}</</h1>>
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                            <Info className="h-4 w-4" />
                            <span>Resultados de votaciones y acuerdos establecidos por los socios.</span>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                    Este documento consolida las decisiones y resoluciones sometidas a votación, detallando los lineamientos operativos, financieros y normativos aplicables para los periodos 2025 y 2026 dentro del fondo.
                </p>
            </div>

            {/* Segments of resolutions */}
            {[
                { title: 'Aprobaciones 2025', data: resolutions.filter(r => r.id !== 12) },
                { title: 'Primer informe 2026', data: resolutions.filter(r => r.id === 12) }
            ].map((section, idx) => (
                <div key={idx} className={`space-y-4 ${idx > 0 ? 'pt-6' : ''}`}>
                    <h2 className="text-lg font-bold text-brand-primary border-b-2 border-gray-100 pb-2">
                        {section.title}
                    </h2>
                    <div className="grid gap-6">
                        {section.data.map((res) => (
                            <div
                                key={res.id}
                                className={cn(
                                    "bg-white rounded-xl border shadow-sm overflow-hidden transition-all",
                                    res.approved ? "border-green-200/50" : "border-red-200/50 opacity-90"
                                )}
                            >
                                {/* Card Header */}
                                <div className={cn(
                                    "px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                                    res.approved ? "bg-green-50/50 border-green-100" : "bg-red-50/50 border-red-100"
                                )}>
                                    <div className="flex items-center gap-3">
                                        {res.approved ? (
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                        ) : (
                                            <XCircle className="h-5 w-5 text-red-500" />
                                        )}
                                        <h3 className={cn(
                                            "font-semibold",
                                            res.approved ? "text-green-900" : "text-red-900"
                                        )}>
                                            {res.title}
                                        </h3>
                                    </div>

                                    {/* Voting Results Badge */}
                                    <div className="flex items-center gap-3 text-sm">
                                        <span className={cn(
                                            "px-3 py-1 rounded-full font-medium text-xs",
                                            res.approved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                        )}>
                                            {res.approved ? 'Aprobado' : 'Rechazado'}
                                        </span>
                                        <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                                            <span className="text-green-600">Sí: {res.votes.si}</span>
                                            <span className="text-gray-300">|</span>
                                            <span className="text-red-500">No: {res.votes.no}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Card Body */}
                                <div className="p-6">
                                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                        {res.description}
                                    </div>
                                    {res.note && (
                                        <div className="mt-4 text-xs font-medium text-red-600 bg-red-50 p-3 rounded-md border border-red-100">
                                            Nota: {res.note}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Footer note */}
            <p className="text-xs text-center text-gray-400 pb-4 pt-4">
                La información aquí presentada refleja los resultados de las encuestas oficiales realizadas a todos los socios activos.
            </p>
        </div>
    );
};

export default UserResolutionsPage;
