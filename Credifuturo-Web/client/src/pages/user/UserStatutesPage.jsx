import { Scale, Calendar } from 'lucide-react';
import { cn } from '../../utils/cn';

const articles = [
    {
        num: 'I',
        text: 'Inicialmente El ingreso al fondo será de familiares (Tíos, Primos, Padres, Hermanos, Cuñados, Novios).'
    },
    {
        num: 'II',
        text: 'Para el ingreso de un tercero no familiar al fondo se deberá poner a consideración de los socios actuales y se someterá a votación por los mismos si se aprueba el ingreso, solamente podrán votar los socios que se encuentren al día en el aporte mensual y al día en el pago de los intereses si tiene algún préstamo.'
    },
    {
        num: 'III',
        text: 'Para la creación del fondo o el ingreso de un nuevo socio se debe abonar el equivalente a $ 500.000 pesos colombianos, Este en adelante se llamará APORTE INICIAL el cual será parte de su ahorro y capital de trabajo.'
    },
    {
        num: 'IV',
        text: 'Se abrirá una cuenta de ahorros de alta rentabilidad de preferencia en NUBANK el cual no tiene manejo de tarjeta a nombre de DORIS PASCUAS el cual será administrado por LEONARDO ROJAS quien en ausencia de la titular tendrá la potestad de hacer uso de esta cuenta para lo correspondiente es decir para el objeto que fue creado el fondo.'
    },
    {
        num: 'V',
        text: 'Los Futuros Socios Fundadores se estable un plazo máximo de pago del APORTE INICIAL hasta el 31 de Diciembre 2024.'
    },
    {
        num: 'VI',
        text: 'Se establece una cuota llamada APORTE MENSUAL el cual será mínimo de $20.000 Pesos colombianos estos se deben abonar los primeros 10 días de cada mes a partir del 1 de enero del 2025.'
    },
    {
        num: 'VII',
        text: 'A partir del Dia 11 del Mes se procederá a cobrar intereses por mora, Estos serán de $1.000 pesos colombianos diarios independientemente del APORTE MENSUAL que se vaya a ahorrar.'
    },
    {
        num: 'VIII',
        text: 'Dicho APORTE MENSUAL no tendrá límite de ahorro el valor mínimo serán los 20.000 ya Mencionados anteriormente.'
    },
    {
        num: 'IX',
        text: 'Inicialmente se establece un valor máximo a prestar por parte del FONDO FAMILIAR que será de $1.000.000 pesos colombianos con un interés del 1,5% Mes vencido.'
    },
    {
        num: 'X',
        text: 'Para prestamos a terceros que tengan relación con algún socio fundador el interés será de 2% Mes vencido, el socio que recomiende a este responderá con su capital invertido en caso de incumplimiento de pago.'
    },
    {
        num: 'XI',
        text: 'Cualquier decisión o duda que se tenga en el fondo será puesta a consideración y votación, No se podrá tomar alguna acción si no se cuenta con los votos de la mitad +1 de los Socios.'
    }
];

const UserStatutesPage = () => {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-brand-primary/10 rounded-lg">
                        <Scale className="h-6 w-6 text-brand-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Estatutos del Fondo Familiar {!user?.nombre ? '' : `- ${user.nombre} ${user.apellido || ''}`.trim()}</h1>
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                            <Calendar className="h-4 w-4" />
                            <span>Estatutos Iniciales — Fecha de Fundación: 01/12/2024</span>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                    A continuación se presentan las reglas y condiciones de ingreso y funcionamiento del{' '}
                    <span className="font-semibold text-gray-800">FONDO FAMILIAR CREDIFUTURO</span>,
                    acordadas por los socios fundadores en la fecha de constitución.
                </p>
            </div>

            {/* Articles */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Estatutos o Reglas de Ingreso al Fondo Familiar
                    </h2>
                </div>
                <ol className="divide-y divide-gray-100">
                    {articles.map((article, index) => (
                        <li key={article.num} className="flex gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary text-sm font-bold flex items-center justify-center mt-0.5">
                                {article.num}
                            </span>
                            <p className={cn(
                                "text-sm leading-relaxed",
                                index >= 4 && index < 8
                                    ? "text-gray-900 font-medium"
                                    : "text-gray-700"
                            )}>{article.text}</p>
                        </li>
                    ))}
                </ol>
            </div>

            {/* Footer note */}
            <p className="text-xs text-center text-gray-400 pb-4">
                Estos estatutos fueron aprobados por los socios fundadores el 01 de diciembre de 2024.
            </p>
        </div>
    );
};

export default UserStatutesPage;
