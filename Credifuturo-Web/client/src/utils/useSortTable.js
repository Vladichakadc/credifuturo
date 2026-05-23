import { useState, useMemo } from 'react';

const extractNum = (val) => parseInt((val || '').toString().replace(/\D/g, '') || '0');
const isDateStr = (val) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val);
const isPrefixedNum = (val) => typeof val === 'string' && /^[A-Za-z]+\d+$/.test(val.trim());

function compareValues(av, bv) {
    if (av === null || av === undefined) av = '';
    if (bv === null || bv === undefined) bv = '';
    if (typeof av === 'number' || typeof bv === 'number') {
        return (parseFloat(av) || 0) - (parseFloat(bv) || 0);
    }
    const aStr = av.toString().trim();
    const bStr = bv.toString().trim();
    if (aStr !== '' && bStr !== '' && !isNaN(aStr) && !isNaN(bStr)) {
        return parseFloat(aStr) - parseFloat(bStr);
    }
    if (isDateStr(aStr) || isDateStr(bStr)) {
        return new Date(aStr || 0) - new Date(bStr || 0);
    }
    if (isPrefixedNum(aStr) || isPrefixedNum(bStr)) {
        return extractNum(aStr) - extractNum(bStr);
    }
    return aStr.localeCompare(bStr, 'es', { numeric: true });
}

export function useSortTable(data, defaultKey = '', defaultDir = 'asc') {
    const [sortConfig, setSortConfig] = useState({ key: defaultKey, dir: defaultDir });

    const handleSort = (key) => {
        setSortConfig(prev =>
            prev.key === key
                ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: 'asc' }
        );
    };

    const sortedData = useMemo(() => {
        if (!sortConfig.key || !data?.length) return data || [];
        return [...data].sort((a, b) => {
            const cmp = compareValues(a[sortConfig.key], b[sortConfig.key]);
            return sortConfig.dir === 'asc' ? cmp : -cmp;
        });
    }, [data, sortConfig]);

    return { sortedData, sortConfig, handleSort };
}

// Inline sort indicator — use inside <th> elements
import React from 'react';
export function SortIcon({ colKey, sortConfig }) {
    if (sortConfig.key !== colKey) return React.createElement('span', { className: 'ml-1 text-[9px] opacity-25' }, '⇅');
    return React.createElement('span', { className: 'ml-1 text-[9px]' }, sortConfig.dir === 'asc' ? '▲' : '▼');
}
