import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2];

const YearMultiSelect = ({ selectedYears, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (year) => {
        if (selectedYears.includes(year)) {
            const next = selectedYears.filter(y => y !== year);
            if (next.length > 0) onChange(next.sort((a, b) => a - b));
        } else {
            onChange([...selectedYears, year].sort((a, b) => a - b));
        }
    };

    const label = selectedYears.length === 0
        ? 'Año'
        : selectedYears.length === 1
            ? `${selectedYears[0]}`
            : selectedYears.length === YEAR_OPTIONS.length
                ? 'Todos los años'
                : selectedYears.join(', ');

    return (
        <div ref={ref} className="relative" data-html2canvas-ignore="true">
            <button
                onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-3 rounded-xl border-2 border-emerald-200/80 shadow-sm transition-all hover:shadow-lg hover:border-emerald-300 h-11"
            >
                <Calendar className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span className="text-sm font-bold text-emerald-900 whitespace-nowrap">{label}</span>
                <ChevronDown className={`h-3 w-3 text-emerald-600 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-emerald-200 rounded-xl shadow-xl z-50 min-w-[150px] overflow-hidden">
                    <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Filtrar por año</span>
                    </div>
                    {YEAR_OPTIONS.map(year => (
                        <label key={year} className="flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                checked={selectedYears.includes(year)}
                                onChange={() => toggle(year)}
                                className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                            />
                            <span className="text-sm font-bold text-emerald-900">{year}</span>
                            {year === THIS_YEAR && <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full ml-auto">Actual</span>}
                            {year === THIS_YEAR + 1 && <span className="text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full ml-auto">Próximo</span>}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default YearMultiSelect;
