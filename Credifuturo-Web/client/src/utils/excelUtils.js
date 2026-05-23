import * as XLSX from 'xlsx';

/**
 * Formatea cualquier fecha al formato dd-mm-aaaa
 * Acepta: strings ISO ('2024-12-19'), Date objects, o valores nulos.
 * Retorna: '19-12-2024' o '—' si no hay valor.
 */
export const formatDate = (value) => {
    if (!value) return '—';
    try {
        // Handle ISO date strings like '2024-12-19' or '2024-12-19T00:00:00.000Z'
        const str = String(value).split('T')[0]; // 'YYYY-MM-DD'
        const parts = str.split('-');
        if (parts.length === 3) {
            const [yyyy, mm, dd] = parts;
            return `${dd.padStart(2, '0')}-${mm.padStart(2, '0')}-${yyyy}`;
        }
        return value;
    } catch {
        return value;
    }
};

export const exportToExcel = (data, filename, sheetName = 'Reporte', columnFormats = {}) => {
    if (!data || data.length === 0) {
        return { success: false, error: 'No hay datos para exportar' };
    }
    try {
        const worksheet = XLSX.utils.json_to_sheet(data);

        // Apply specific column styles based on the Headers provided in columnFormats
        // columnFormats example: { 'Saldo Inicial': '"$"#,##0.00', 'Interes Mensual': '0.00%' }
        if (Object.keys(columnFormats).length > 0) {
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            const headerRow = range.s.r;

            // Map header names to their column indexes
            const colIndexes = {};
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const headCell = worksheet[XLSX.utils.encode_cell({ c: C, r: headerRow })];
                if (headCell && headCell.v) colIndexes[headCell.v] = C;
            }

            // Apply formats to all rows for specified columns
            Object.entries(columnFormats).forEach(([headerName, formatCode]) => {
                const C = colIndexes[headerName];
                if (C !== undefined) {
                    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                        const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
                        const cell = worksheet[cellAddress];
                        if (cell && cell.t === 'n') { // only apply to number cells
                            cell.z = formatCode;
                        }
                    }
                }
            });
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, `${filename}.xlsx`);
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Error al exportar: ' + error.message };
    }
};
