# -*- coding: utf-8 -*-
"""
Informe para la Junta: abonos extraordinarios a capital.

Genera `shared-informes/Abonos_Extraordinarios_a_Capital.pdf` con el mismo
formato del informe de interés proporcional en retanqueos.

    python3 abonos_extraordinarios.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plantilla import Informe  # noqa: E402

FECHA = '23 de agosto de 2026'
SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '..', 'shared-informes', 'Abonos_Extraordinarios_a_Capital.pdf')

d = Informe(titulo1='Nueva funcionalidad:',
            titulo2='Abonos extraordinarios a capital',
            fecha=FECHA)

# ── 1 ──────────────────────────────────────────────────────────────────
d.seccion('¿Qué ocurría?')
d.parrafo(
    'Un socio que pagaba más de su cuota no obtenía nada a cambio. El excedente quedaba '
    'registrado, pero no bajaba su deuda, no reducía los intereses que le faltaban por pagar '
    'y no aparecía en el recaudo del fondo. El dinero entraba y no figuraba en ninguna cifra.')
d.parrafo(
    'Se verificó contra el servidor. Un socio con una cuota de $250.000 paga $400.000. Antes '
    'del cambio, las cuotas siguientes quedaban **idénticas**: mismo saldo, mismo interés, '
    'misma cuota. Los $150.000 de diferencia no hacían nada.')
d.parrafo(
    '**El dinero tampoco figuraba en el recaudo.** La cifra sumaba lo que la cuota decía que '
    'se debía, no lo que el socio realmente pagó. De modo que el fondo recibía un ingreso que no '
    'reducía la cartera ni aparecía en ningún indicador.')
d.parrafo(
    'Eso ya está corregido, y desde este mes **el sistema lo hace solo**: revisa la cartera al '
    'arrancar y cada noche, encuentra los pagos por encima de la cuota que siguen sin abonarse '
    'a capital y rehace el cronograma. Ya no hace falta que nadie vuelva a guardar la cuota.')
d.parrafo(
    'El caso que motivó la revisión: una socia con una cuota de **$778.666,67** pagó '
    '**$1.000.000**. Los **$221.333,33** de diferencia llevaban meses sin abonar a capital. '
    'Aplicados, le bajan la cuota a $746.113 y le ahorran **$18.592** en intereses.')

# ── 2 ──────────────────────────────────────────────────────────────────
d.seccion('Cuánto vale el excedente')
d.parrafo(
    'El fondo amortiza por **sistema alemán**: el capital de cada cuota es constante y el '
    'interés se liquida sobre el saldo vivo, por eso la cuota va bajando. Al reducir el saldo, '
    'todo el interés aún no causado se abarata.')
d.formula('Excedente a capital = Lo pagado − Valor de la cuota',
          'Saldo nuevo = Saldo inicial − (Lo pagado − Intereses del período)')
d.parrafo(
    'Sobre un crédito de **$2.000.000 a 10 cuotas al 1,5% mensual**, con un abono en la cuota 3:')
d.rotulo('Abono en la cuota 3')
d.tabla([
    ('Valor de la cuota 3', '$224.000'),
    ('Lo que paga el socio', '$400.000'),
    ('= Excedente que abona a capital', '$176.000'),
], destacar=2)
d.rotulo('Efecto sobre la deuda')
d.tabla([
    ('Saldo antes del abono', '$1.400.000'),
    ('Interés que faltaba por pagar', '$84.000'),
    ('= Saldo después del abono', '$1.224.000'),
], destacar=2)

# ── 3 ──────────────────────────────────────────────────────────────────
d.seccion('Las dos formas de aplicarlo')
d.tabla([
    ('Qué hace', 'cuotas más bajas', 'termina antes'),
    ('Cuota 4', '$193.217', '$218.360'),
    ('Interés restante', '$73.440', '$65.520'),
    ('Ahorro del socio', '$10.560', '$18.480'),
    ('Retorno del fondo', '$73.440', '$65.520'),
], encabezado=('Concepto', 'Reducir la cuota', 'Reducir el plazo'), destacar=4)
d.rotulo('Por qué se dejó "reducir la cuota" por defecto')
d.parrafo(
    'Reducir el plazo le ahorra más al socio. Si esto fuera un banco, la recomendación sería '
    'esa sin discusión.')
d.parrafo(
    'Pero aquí el interés no es utilidad de un accionista: **es el rendimiento de los propios '
    'socios ahorradores**. Los $7.920 de diferencia entre una política y otra salen del retorno '
    'colectivo. Un socio que abona anticipadamente reduce, en esa proporción, lo que rinde el '
    'ahorro de los demás.')
d.parrafo(
    'Por eso el sistema aplica **reducir la cuota** cuando no se indica otra cosa, y deja '
    '**reducir el plazo** disponible a solicitud del socio. La decisión sobre su propio crédito '
    'le corresponde a él; lo que se define aquí es solo qué pasa si no se pronuncia.')
d.parrafo(
    'La diferencia es pequeña en un caso aislado. Deja de serlo si el abono anticipado se '
    'vuelve práctica común, y conviene que la regla esté definida antes de que eso ocurra.')

# ── 4 ──────────────────────────────────────────────────────────────────
d.seccion('Una advertencia sobre los créditos actuales')
d.parrafo(
    'Recalcular un cronograma exige que sus cifras sean aritméticamente sanas. Los créditos '
    'cargados por importación desde Excel **no lo son**:')
d.tabla([
    ('Interés de la cuota', '$3.620', '$30.000'),
    ('Capital por cuota', '$246.380', '$166.667'),
], encabezado=('Concepto', 'Registrado', 'Según sus condiciones'))
d.parrafo(
    'Además, todas las cuotas de un mismo préstamo repiten el mismo saldo inicial, de modo que '
    'no hay una línea de saldo que continuar.')
d.parrafo(
    'Aplicarles el recálculo produciría cifras inventadas sobre deuda real de socios. Por eso '
    'el sistema **detecta esta condición y se niega a reescribir**: registra el abono, avisa al '
    'administrador y deja el cronograma intacto. En la lista, esa cuota aparece marcada como '
    '"sin recalcular".')
d.rotulo('La reparación')
d.parrafo(
    'Las **condiciones** del crédito sí están bien guardadas: valor prestado, número de cuotas '
    'y tasa. Con eso se puede rehacer el cronograma correcto desde cero, sin depender de las '
    'columnas dañadas. Se entregó una herramienta que diagnostica primero y solo escribe si se '
    'le pide expresamente:')
d.bloque_codigo([
    'node reconstruir_cronograma.js                    -> diagnostica todos',
    'node reconstruir_cronograma.js --prestamo VM_001  -> detalle cuota por cuota',
    'node reconstruir_cronograma.js --aplicar          -> escribe los cambios',
])
d.parrafo(
    'Respeta lo que no debe tocar: las cuotas ya pagadas conservan su estado y lo que el socio '
    'pagó — solo se corrigen las columnas de cálculo. Y se niega cuando el número de filas no '
    'coincide con las cuotas pactadas, porque ahí no hay forma de emparejar cada fila con su '
    'posición sin adivinar.')
d.parrafo(
    '**Recomendación:** correr primero el diagnóstico, revisar el resultado en Junta y sacar '
    'copia de la base antes de aplicar nada. Se está corrigiendo deuda registrada de socios '
    'reales.')


# ── 5 ──────────────────────────────────────────────────────────────────
d.seccion('Lo que se encontró al revisar el motor')
d.parrafo(
    'Al reproducir el caso aparecieron defectos en el cálculo que ya estaba en funcionamiento. '
    'Se corrigieron antes de dejar que el sistema actuara solo. Ninguno se había manifestado '
    'todavía porque el recálculo casi nunca llegaba a dispararse.')
d.rotulo('El más grave')
d.parrafo(
    'Si el socio había pagado cuotas **después** de aquella en la que abonó de más, el recálculo '
    'devolvía al saldo el capital de esas cuotas intermedias. Sobre el crédito de $8.000.000, la '
    'cuota 4 arrancaba en $7.112.000 en vez de $5.778.667 —**$1.333.333 de deuda inventada**— y '
    'cada cuota restante subía de unos $760.000 a unos $889.790.')
d.parrafo(
    'Ahora el cronograma se rehace completo aplicando los pagos que de verdad ocurrieron. Como '
    'el interés de esas cuotas intermedias se liquida sobre un saldo menor, lo que el socio pagó '
    'de más en intereses **se le devuelve en forma de capital**.')
d.rotulo('Los demás')
d.vinetas([
    'Un préstamo que ya había recibido un abono quedaba marcado como no recalculable para '
    'siempre, de modo que un **segundo abono** del mismo socio se rechazaba.',
    'La última cuota no cerraba el saldo en cero: dejaba un residuo de céntimos.',
    'Un pago registrado directamente como pagado y por encima de su cuota no disparaba nada.',
    'Cuando las cuotas de un mismo préstamo declaraban **tasas distintas** —una corrección hecha '
    'a mano—, el recálculo imponía a todas la de la primera: $367.200 que el fondo dejaba de '
    'cobrar, o $331.552 de más al socio según en qué dirección estuviera la diferencia.',
    'Una cuota marcada como pagada **por debajo de su valor** hacía subir las siguientes y le '
    'anunciaba al socio un ahorro negativo. Ahora se rechaza y pasa a revisión manual.',
    'Cuando el registro del préstamo declaraba menos cuotas de las que realmente tiene el '
    'cronograma, el capital salía al doble y **se anulaban cuotas que el socio sí debía**.',
])

# ── 6 ──────────────────────────────────────────────────────────────────
d.seccion('Por qué es seguro que actúe solo')
d.parrafo(
    'El sistema está reescribiendo la deuda registrada de personas reales, y los respaldos '
    'diarios son hojas de cálculo: sirven para consultar, no para restaurar. Por eso cada '
    'reajuste es **reversible**.')
d.vinetas([
    'Antes de la primera escritura se copia el archivo completo de la base de datos.',
    'De cada cuota que se toca se guarda el valor anterior de todas sus columnas, de modo que un '
    'administrador puede deshacer el reajuste desde la pantalla y las cifras vuelven exactamente '
    'a como estaban.',
    'Si un administrador revierte un reajuste, el sistema **no vuelve a aplicarlo solo**: '
    'entiende que hubo una decisión y espera a que se la pidan.',
    'Dos ejecuciones simultáneas no pueden pisarse, y volver a pasar el barrido sobre un '
    'préstamo ya ajustado no cambia nada: la marca de que un abono está aplicado son las propias '
    'cifras, no una nota que alguien pueda borrar.',
])
d.parrafo(
    'Y lo que no es inequívoco no se toca. Los cronogramas heredados, los préstamos con cuotas '
    'en mora, los abonos de ejercicios ya cerrados, los pagos incompletos y las tasas mixtas '
    'quedan **listados en la pantalla de pagos** con el motivo, para que una persona decida.')

# ── 7 ──────────────────────────────────────────────────────────────────
d.seccion('Qué quedó funcionando')
d.vinetas([
    'El excedente sobre la cuota **abona a capital**, y el cronograma se rehace sobre el saldo '
    'nuevo con sus intereses correspondientes, sin que nadie tenga que pedirlo.',
    'Nada anterior al abono se toca, y una cuota en mora tampoco: su interés ya se causó por el '
    'tiempo que lleva vencida y no se condona. De las cuotas pagadas **después** del abono sí se '
    'rehace el reparto entre interés y capital, siempre a favor del socio: pagó lo mismo, pero '
    'parte de lo que se contó como interés pasa a amortizar deuda.',
    'El ajuste opera sobre el **año en curso en adelante**. Los ejercicios cerrados ya '
    'repartieron sus intereses entre los socios y no se reescriben hacia atrás.',
    'Si el abono cancela el crédito, las cuotas sobrantes se marcan como prepagadas y quedan '
    'fuera del cálculo de rentabilidad.',
    'El **recaudo cuenta el dinero realmente recibido**. Al momento del cambio no movió ninguna '
    'cifra —las cuotas pagadas coincidían exactamente— pero deja de ocultar excedentes de aquí '
    'en adelante.',
    'La lista muestra una columna **"Valor Pagado"** que señala el excedente y qué se hizo con él; '
    'el formulario **avisa antes de guardar** y permite elegir la política.',
    'El socio recibe una notificación con cuánto abonó a capital y cuánto se ahorra en intereses.',
    'Si el abono supera la deuda entera, el sobrante queda **señalado como dinero a favor del '
    'socio**, para devolvérselo.',
])
d.rotulo('Defectos corregidos en el camino')
d.vinetas([
    'El administrador **no podía editar ni crear ningún movimiento negativo** —devoluciones, '
    'descuentos, distribuciones—. La validación de mora los rechazaba siempre, incluso al '
    'corregir una observación.',
    'El formulario de pagos invertía dos campos y, en cada edición, **reescribía el total de '
    'cuotas del préstamo** con el número de la cuota que se estaba tocando.',
])

# ── 8 ──────────────────────────────────────────────────────────────────
d.seccion('Decisiones para la Junta')
d.vinetas([
    '**Ratificar la política por defecto.** Quedó "reducir cuota". Si la Junta prefiere '
    '"reducir plazo", es un parámetro y se cambia sin desarrollo.',
    '**Interés del mes en curso.** Hoy el abono se aplica sobre el interés completo del '
    'período. El fondo ya usa prorrateo por días en las refinanciaciones; convendría unificar '
    'el criterio.',
    '**Los créditos heredados.** Quedan fuera del ajuste automático hasta que se reconstruyan '
    'sus cronogramas. Decidir si se repara y con qué alcance.',
    '**Comunicación al socio.** Conviene que sepa que puede abonar a capital y que puede elegir '
    'entre menor cuota o menor plazo.',
])

# ── 9 ──────────────────────────────────────────────────────────────────
d.seccion('Alcance y vigencia')
d.parrafo(
    'El ajuste alcanza **todo el ejercicio en curso**: no espera a la próxima cuota, sino que '
    'revisa hacia atrás los pagos de este año que se hicieron por encima de la cuota y nunca se '
    'abonaron. Los ejercicios anteriores no se tocan.')
d.parrafo(
    'Los valores de este informe se calcularon con la misma fórmula que usa el generador de '
    'cronogramas del sistema y se verificaron contra el servidor en varios escenarios: préstamo '
    'heredado (se niega y explica), abono con cada una de las dos políticas, abono que cancela '
    'el crédito, y pago exacto (no dispara nada). El ejemplo usa un crédito de $2.000.000 a 10 '
    'cuotas del 1,5% mensual; los créditos reales del fondo tienen condiciones distintas, pero '
    'las proporciones se mantienen.')
d.parrafo(
    '**El diagnóstico sobre la cartera real lo hará el propio sistema** en el primer arranque '
    'tras este cambio, y dejará el resultado en la pantalla de pagos y en un aviso a los '
    'administradores: cuántos créditos se ajustaron, cuánto capital se aplicó y qué préstamos '
    'quedaron esperando una decisión. Hasta ese momento no se sabe cuánto dinero hay sin aplicar '
    'a capital en el conjunto del fondo.')

print(d.guardar(os.path.normpath(SALIDA)))
