// Script de diagnóstico para verificar Customer_Id en Clients
const { sequelize } = require('./config/database');
const Client = require('./models/Client');

async function diagnosticarCustomerId() {
    try {
        console.log('🔍 DIAGNÓSTICO DE Customer_Id EN CLIENTS\n');

        const clients = await Client.findAll({
            attributes: ['id', 'customerId', 'name', 'email'],
            order: [['id', 'DESC']],
            limit: 25
        });

        console.log(`📊 Total de clientes encontrados: ${clients.length}\n`);

        console.log('=== ÚLTIMOS 25 CLIENTES ===');
        clients.forEach(client => {
            console.log(`DB ID: ${client.id} | customerId: ${client.customerId || 'NULL'} | Nombre: ${client.name}`);
        });

        // Analizar formatos
        console.log('\n=== ANÁLISIS DE FORMATOS ===');

        const numericIds = clients.filter(c => c.customerId && /^\d+$/.test(c.customerId));
        const withPrefix = clients.filter(c => c.customerId && /^[A-Z]+\d+$/.test(c.customerId));
        const nullIds = clients.filter(c => !c.customerId);

        console.log(`✅ IDs numéricos (ej: "1", "23"): ${numericIds.length}`);
        if (numericIds.length > 0) {
            const nums = numericIds.map(c => parseInt(c.customerId)).filter(n => !isNaN(n));
            if (nums.length > 0) {
                console.log(`   Máximo numérico: ${Math.max(...nums)}`);
            }
        }

        console.log(`✅ IDs con prefijo (ej: "CLI1", "SOC10"): ${withPrefix.length}`);
        if (withPrefix.length > 0) {
            console.log(`   Ejemplos: ${withPrefix.slice(0, 3).map(c => c.customerId).join(', ')}`);
        }

        console.log(`⚠️  Sin customerId: ${nullIds.length}`);

        // Calcular próximo ID
        console.log('\n=== CÁLCULO DEL PRÓXIMO ID ===');

        const validNumericIds = clients
            .map(c => c.customerId)
            .filter(id => id && /^\d+$/.test(id))
            .map(id => parseInt(id))
            .filter(n => !isNaN(n));

        if (validNumericIds.length === 0) {
            console.log('🆕 No hay IDs numéricos válidos -> Próximo ID: 1');
        } else {
            const maxId = Math.max(...validNumericIds);
            const nextId = maxId + 1;
            console.log(`📌 Máximo ID encontrado: ${maxId}`);
            console.log(`✅ PRÓXIMO ID CORRECTO: ${nextId}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

diagnosticarCustomerId();
