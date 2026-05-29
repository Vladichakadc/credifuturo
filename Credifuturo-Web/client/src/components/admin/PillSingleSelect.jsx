import React from 'react';
import { ChevronDown } from 'lucide-react';

const PillSingleSelect = ({ options, selectedValue, onChange, labelPrefix, icon: Icon }) => {
    return (
        <div className="relative inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-green-50 pl-5 pr-10 rounded-xl border-2 border-emerald-200/80 shadow-sm transition-all hover:shadow-lg hover:border-emerald-300 h-11 focus-within:ring-2 focus-within:ring-emerald-500/20 max-w-[300px]">
            {Icon && <Icon className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
            <select
                aria-label={labelPrefix ? `Filtrar por ${labelPrefix}` : 'Filtrar'}
                value={selectedValue}
                onChange={(e) => onChange(e.target.value)}
                className="w-full text-sm font-bold text-emerald-900 bg-transparent border-none focus:ring-0 cursor-pointer outline-none py-3 pl-0 pr-0 appearance-none truncate"
            >
                <option value="">{labelPrefix} (Todos)</option>
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
            <ChevronDown className="h-4 w-4 text-emerald-600 absolute right-4 pointer-events-none" />
        </div>
    );
};

export default PillSingleSelect;
