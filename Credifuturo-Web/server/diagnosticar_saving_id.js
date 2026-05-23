// Script de diagnóstico para verificar externalId (AM##) en Savings
const { sequelize } = require('./config/database');
const Saving = require('./models/Saving');

async function diagnosticarSavingId() {
    try {
        console.log('🔍 DIAGNÓSTICO DE externalId (AM##) EN SAVINGS\n');

        const savings = await Saving.findAll({
            attributes: ['id', 'externalId', 'clientId', 'amount', 'date'],
            order: [['id', 'DESC']],
            limit: 25
        });

        console.log(`📊 Total de registros encontrados: ${savings.length}\n`);

        console.log('=== ÚLTIMOS 25 AHORROS ===');
        savings.forEach(saving => {
            console.log(`DB ID: ${saving.id} | externalId: ${saving.externalId || 'NULL'} | Monto: ${saving.amount}`);
        });

        // Analizar formato AM##
        console.log('\n=== ANÁLISIS DE FORMATO AM{N} ===');
        const amPattern = /^AM(\d+)$/;

        const withAM = savings.filter(s => s.externalId && amPattern.test(s.externalId));
        const withoutAM = savings.filter(s => !s.externalId || !amPattern.test(s.externalId));

        console.log(`✅ Registros con externalId válido (AM{N}): ${withAM.length}`);
        if (withAM.length > 0) {
            const nums = withAM.map(s => parseInt(s.externalId.match(amPattern)[1]));
            console.log(`   Máximo: AM${Math.max(...nums)}`);
            console.log(`   Mínimo: AM${Math.min(...nums)}`);
        }

        console.log(`⚠️  Registros SIN externalId válido: ${withoutAM.length}`);
        if (withoutAM.length > 0 && withoutAM.length <= 5) {
            console.log(`   Ejemplos: ${withoutAM.map(s => s.externalId || 'NULL').join(', ')}`);
        }

        // Calcular próximo ID
        console.log('\n=== CÁLCULO DEL PRÓXIMO ID ===');
        const amNumbers = savings
            .map(s => s.externalId)
            .filter(id => id && amPattern.test(id))
            .map(id => parseInt(id.match(amPattern)[1]))
            .filter(n => !isNaN(n));

        if (amNumbers.length === 0) {
            console.log('🆕 Base de datos vacía o sin IDs válidos -> Próximo ID: AM339 (default)');
        } else {
            const maxAM = Math.max(...amNumbers);
            const nextAM = maxAM + 1;
            console.log(`📌 Máximo ID encontrado: AM${maxAM}`);
            console.log(`✅ PRÓXIMO ID CORRECTO: AM${nextAM}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

diagnosticarSavingId();
