// Script de prueba para verificar la generación de consecutivo de Ahorros (AM## o AI##)
const axios = require('axios');

async function probarConsecutivoSavings() {
    console.log('🧪 PRUEBA DE CONSECUTIVO AHORROS (AM## / AI##)\n');

    try {
        // 1. Consultar estado actual
        console.log('1. 📊 Consultando ahorros existentes...');
        const { data: savings } = await axios.get('http://localhost:3000/api/admin/clients');

        // Como no hay endpoint directo de savings, vamos a consultar desde el frontend
        // o crear uno temporal
        console.log('   ℹ️  Verificando desde base de datos directamente...\n');

        const Saving = require('./models/Saving');
        const allSavings = await Saving.findAll({
            attributes: ['id', 'externalId', 'amount'],
            order: [['id', 'DESC']],
            limit: 50
        });

        const amPattern = /^AM(\d+)$/;
        const aiPattern = /^AI(\d+)$/;

        const validIds = allSavings
            .map(s => s.externalId)
            .filter(id => id && (amPattern.test(id) || aiPattern.test(id)))
            .map(id => {
                const amMatch = id.match(amPattern);
                const aiMatch = id.match(aiPattern);
                return {
                    id,
                    number: parseInt(amMatch ? amMatch[1] : aiMatch[1]),
                    prefix: amMatch ? 'AM' : 'AI'
                };
            });

        const maxEntry = validIds.reduce((max, curr) => curr.number > max.number ? curr : max, { number: 0, id: '', prefix: 'AM' });

        console.log(`   ✅ Total de ahorros: ${allSavings.length}`);
        console.log(`   ✅ IDs válidos encontrados: ${validIds.length}`);
        console.log(`   📌 Máximo ID: ${maxEntry.id}`);
        console.log(`   📌 Esperamos que el siguiente sea: ${maxEntry.prefix}${maxEntry.number + 1}\n`);

        // Análisis de prefijos
        const amCount = validIds.filter(v => v.prefix === 'AM').length;
        const aiCount = validIds.filter(v => v.prefix === 'AI').length;
        console.log(`   📊 Distribución de prefijos:`);
        console.log(`      - AM (Ahorros Mensuales): ${amCount}`);
        console.log(`      - AI (Aportes Iniciales): ${aiCount}`);
        console.log(`      - Prefijo dominante: ${aiCount > amCount ? 'AI' : 'AM'}\n`);

        // 2. Resultado esperado
        console.log('2. ✔️  RESULTADO ESPERADO:');
        const expectedPrefix = aiCount > amCount ? 'AI' : 'AM';
        const expectedNext = `${expectedPrefix}${maxEntry.number + 1}`;
        console.log(`   Próximo ID que debe generar el frontend: ${expectedNext}\n`);

        console.log('═══════════════════════════════════════');
        console.log('✅ DIAGNÓSTICO COMPLETADO');
        console.log('═══════════════════════════════════════');
        console.log('\n📝 NOTA: Para probar completamente, abre el frontend y');
        console.log('   verifica que el campo "ID_VM" en Ahorros muestre el ID correcto.\n');

        process.exit(0);
    } catch (error) {
        console.log('\n❌ ERROR EN LA PRUEBA:');
        console.error(error.message);
        process.exit(1);
    }
}

probarConsecutivoSavings();
