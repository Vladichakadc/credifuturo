import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

const StatusMultiSelect = ({ options, selectedValues, onChange, labelPrefix, icon: Icon }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (val) => {
        if (selectedValues.includes(val)) {
            const next = selectedValues.filter(v => v !== val);
            onChange(next);
        } else {
            onChange([...selectedValues, val]);
        }
    };

    const label = selectedValues.length === 0
        ? `${labelPrefix} (Todos)`
        : selectedValues.length === 1
            ? `${selectedValues[0]}`
            : selectedValues.length === options.length && options.length > 0
                ? `${labelPrefix} (Todos)`
                : `${labelPrefix} (${selectedValues.length})`;

    return (
        <div ref={ref} className="relative" data-html2canvas-ignore="true">
            <button
                onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-3 rounded-xl border-2 border-emerald-200/80 shadow-sm transition-all hover:shadow-lg hover:border-emerald-300 h-11"
            >
                {Icon && <Icon className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
                <span className="text-sm font-bold text-emerald-900 whitespace-nowrap">{label}</span>
                <ChevronDown className={`h-3 w-3 text-emerald-600 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-emerald-200 rounded-xl shadow-xl z-50 min-w-[200px] overflow-hidden">
                    <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">{labelPrefix}</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                        {options.map(opt => (
                            <label key={opt} className="flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={selectedValues.includes(opt)}
                                    onChange={() => toggle(opt)}
                                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                                />
                                <span className="text-sm font-bold text-emerald-900">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StatusMultiSelect;
