const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const Saving = require('./models/Saving');
const sequelize = require('./config/database');

const files = [
    { name: 'Mensual', path: 'C:/Credifuturo/1-orders_table_ahorro_mensual.xlsx', idField: 'Id_VM' },
    { name: 'Aporte Inicial', path: 'C:/Credifuturo/1-orders_table_aportes_iniciales.xlsx', idField: 'Id_AI' }
];

async function detectGhosts() {
    try {
        const validIds = new Map();

        files.forEach(f => {
            if (fs.existsSync(f.path)) {
                const wb = XLSX.readFile(f.path);
                const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                console.log(`Buscando en ${f.name}... ${data.length} filas.`);
                data.forEach(row => {
                    const id = row[f.idField] || row['Id_VM'] || row['Id_AI'] || row['Id_vm'] || row['Id_ai'];
                    if (id) {
                        const cleanId = id.toString().trim();
                        validIds.set(cleanId, f.name);
                        if (cleanId === 'AI36') console.log(`[!] AI36 ENCONTRADO EN EXCEL: ${f.name}`);
                    }
                });
            }
        });

        console.log(`IDs totales en Excels: ${validIds.size}`);

        if (!validIds.has('AI36')) {
            console.log('[!] AI36 NO ESTÁ EN NINGÚN EXCEL.');
        }

        // 2. Consultar IDs en DB
        const dbSavings = await Saving.findAll({ attributes: ['id', 'externalId', 'amount', 'type', 'month'] });

        // El usuario indica que la SOLA FUENTE es el Mensual. 
        // Por lo tanto, cualquier registro AI* o que no esté en Mensual es fantasma.
        const ghosts = dbSavings.filter(s => {
            if (s.type === 'Aporte Inicial') return true; // Eliminar todos los aportes iniciales si así lo pide el usuario
            return s.externalId && !validIds.has(s.externalId.trim()) && validIds.get(s.externalId.trim()) !== 'Mensual';
        });

        console.log(`\n--- REPORTE DE LIMPIEZA ASIGNADO ---`);
        console.log(`Fuente de Verdad Única: 1-orders_table_ahorro_mensual.xlsx`);
        console.log(`Registros de Aporte Inicial detectados (A ELIMINAR): ${dbSavings.filter(s => s.type === 'Aporte Inicial').length}`);
        console.log(`Registros Mensuales huérfanos detectados (A ELIMINAR): ${ghosts.filter(s => s.type === 'Mensual').length}`);
        console.log(`Total candidatos a eliminar: ${ghosts.length}`);

        ghosts.forEach(g => {
            console.log(`- ID_DB: ${g.id} | ExtID: ${g.externalId} | Tipo: ${g.type} | Mes: ${g.month} | Monto: ${g.amount} -> MOTIVO: No está en origen Mensual`);
        });

        if (ghosts.length === 0) {
            console.log('✅ La DB ya está limpia.');
        } else {
            console.log('\n[!] Estos registros serán eliminados en la siguiente fase.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

detectGhosts();
