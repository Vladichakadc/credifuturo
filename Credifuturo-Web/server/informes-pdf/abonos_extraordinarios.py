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

FECHA = '21 de agosto de 2026'
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
    'Eso ya está corregido: el excedente se aplica a capital y las cuotas siguientes se '
    'recalculan sobre el saldo nuevo. Con una salvedad importante —los créditos cargados por '
    'importación— que se explica en el punto 4.')

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
d.seccion('Qué quedó funcionando')
d.vinetas([
    'El excedente sobre la cuota **abona a capital**, y las cuotas posteriores se recalculan '
    'sobre el saldo nuevo con sus intereses correspondientes.',
    'Solo se rehace lo que viene **después** de la cuota pagada y sigue pendiente. Ni lo ya '
    'cobrado, ni una cuota anterior vencida, ni las que estén en mora se modifican — el interés '
    'de una mora ya se causó y no se condona.',
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
])
d.rotulo('Defectos corregidos en el camino')
d.vinetas([
    'El administrador **no podía editar ni crear ningún movimiento negativo** —devoluciones, '
    'descuentos, distribuciones—. La validación de mora los rechazaba siempre, incluso al '
    'corregir una observación.',
    'El formulario de pagos invertía dos campos y, en cada edición, **reescribía el total de '
    'cuotas del préstamo** con el número de la cuota que se estaba tocando.',
])

# ── 6 ──────────────────────────────────────────────────────────────────
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

# ── 7 ──────────────────────────────────────────────────────────────────
d.seccion('Alcance y vigencia')
d.parrafo(
    'El ajuste aplica a partir de la próxima cuota que se registre. No se recalculan pagos ya '
    'cerrados de ejercicios anteriores.')
d.parrafo(
    'Los valores de este informe se calcularon con la misma fórmula que usa el generador de '
    'cronogramas del sistema y se verificaron contra el servidor en varios escenarios: préstamo '
    'heredado (se niega y explica), abono con cada una de las dos políticas, abono que cancela '
    'el crédito, y pago exacto (no dispara nada). El ejemplo usa un crédito de $2.000.000 a 10 '
    'cuotas del 1,5% mensual; los créditos reales del fondo tienen condiciones distintas, pero '
    'las proporciones se mantienen.')
d.parrafo(
    '**Aún no se ha corrido el diagnóstico contra la base de producción.** Hasta hacerlo no se '
    'sabe cuántos créditos son reparables, cuántos requieren decisión manual, ni cuánto dinero '
    'hay hoy sin aplicar a capital. Ese es el primer paso recomendado.')

print(d.guardar(os.path.normpath(SALIDA)))
