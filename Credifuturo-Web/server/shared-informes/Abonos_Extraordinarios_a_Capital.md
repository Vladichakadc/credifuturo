# Abonos extraordinarios a capital

**Informe para la Junta Administrativa · Credifuturo**
Módulo afectado: Pagos → Lista Estado Préstamos

---

## Resumen

Un socio que pagaba más de su cuota no obtenía nada a cambio. El excedente
quedaba registrado, pero no bajaba su deuda, no reducía los intereses que le
faltaban por pagar y no aparecía en el recaudo del fondo. El dinero entraba y no
figuraba en ninguna cifra.

Eso ya está corregido: el excedente se aplica a capital y las cuotas siguientes
se recalculan sobre el saldo nuevo. Con una salvedad importante que se explica
más abajo — sobre los créditos cargados por importación el ajuste no puede
actuar, y hay una herramienta aparte para repararlos.

Quedan tres decisiones que le corresponden a la Junta, al final del documento.

---

## 1. Qué ocurría

Se verificó contra el servidor. Un socio con una cuota de $250.000 paga
$400.000. Antes del cambio, las cuotas siguientes quedaban **idénticas**: mismo
saldo, mismo interés, misma cuota. Los $150.000 de diferencia no hacían nada.

El mensaje de error que devolvía el sistema al intentar corregir uno de esos
registros ilustra el problema:

> El Valor Mensual ($-42.400) no cubre la penalización ($0)

Con penalización en cero no hay nada que cubrir.

**El dinero tampoco figuraba en el recaudo.** La cifra sumaba lo que la cuota
*decía* que se debía, no lo que el socio *pagó*. De modo que el fondo recibía un
ingreso que no reducía la cartera ni aparecía en ningún indicador.

---

## 2. Cuánto vale el excedente

Sobre un crédito de **$2.000.000 a 10 cuotas al 1,5% mensual**, con un abono en
la cuota 3:

| Concepto | Valor |
|---|---|
| Cuota 3 | $224.000 |
| El socio paga | $400.000 |
| Excedente que abona a capital | **$176.000** |
| Saldo tras la cuota 3 | $1.400.000 → **$1.224.000** |
| Interés que faltaba por pagar | $84.000 |

El fondo amortiza por **sistema alemán**: el capital de cada cuota es constante
y el interés se liquida sobre el saldo vivo, por eso la cuota va bajando. Al
reducir el saldo, todo el interés aún no causado se abarata.

---

## 3. Las dos formas de aplicarlo

| | Reducir la cuota | Reducir el plazo |
|---|---|---|
| Qué hace | mismo plazo, cuotas más bajas | mismo capital por cuota, termina antes |
| Cuota 4 | $221.000 → **$193.217** | $221.000 → **$218.360** |
| Interés restante | $84.000 → $73.440 | $84.000 → $65.520 |
| **Ahorro del socio** | **$10.560** | **$18.480** |
| **Retorno del fondo** | **$73.440** | **$65.520** |

### Por qué se dejó "reducir la cuota" por defecto

Reducir el plazo le ahorra más al socio. Si esto fuera un banco, la
recomendación sería esa sin discusión.

Pero aquí el interés no es utilidad de un accionista: **es el rendimiento de los
propios socios ahorradores**. Los $7.920 de diferencia entre una política y otra
salen del retorno colectivo. Un socio que abona anticipadamente reduce, en esa
proporción, lo que rinde el ahorro de los demás.

Por eso el sistema aplica **reducir la cuota** cuando no se indica otra cosa, y
deja **reducir el plazo** disponible a solicitud del socio. La decisión sobre su
propio crédito le corresponde a él; lo que se define aquí es solo qué pasa si no
se pronuncia.

La diferencia es pequeña en un caso aislado. Deja de serlo si el abono
anticipado se vuelve práctica común, y conviene que la regla esté definida antes
de que eso ocurra.

---

## 4. Una advertencia sobre los créditos actuales

Recalcular un cronograma exige que sus cifras sean aritméticamente sanas. Los
créditos cargados por importación desde Excel **no lo son**:

| Concepto | Registrado | Lo que daría el cálculo |
|---|---|---|
| Interés de la cuota | $3.620 | $30.000 |
| Capital por cuota | $246.380 | $166.667 |

Además, todas las cuotas de un mismo préstamo repiten el mismo saldo inicial, de
modo que no hay una línea de saldo que continuar.

Aplicarles el recálculo produciría cifras inventadas sobre deuda real de socios.
Por eso el sistema **detecta esta condición y se niega a reescribir**: registra
el abono, avisa al administrador y deja el cronograma intacto. En la lista, esa
cuota aparece marcada como *"sin recalcular"*.

### La reparación

Las **condiciones** del crédito sí están bien guardadas: valor prestado, número
de cuotas y tasa. Con eso se puede rehacer el cronograma correcto desde cero,
sin depender de las columnas dañadas.

Se entregó una herramienta para hacerlo. Diagnostica primero y solo escribe si
se le pide expresamente:

```
node reconstruir_cronograma.js                    → diagnostica todos
node reconstruir_cronograma.js --prestamo VM_001  → detalle cuota por cuota
node reconstruir_cronograma.js --aplicar          → escribe los cambios
```

Respeta lo que no debe tocar: las cuotas ya pagadas conservan su estado y lo que
el socio pagó — solo se corrigen las columnas de cálculo. Y se niega cuando el
número de filas no coincide con las cuotas pactadas, porque ahí no hay forma de
emparejar cada fila con su posición sin adivinar.

**Recomendación:** correr primero el diagnóstico, revisar el resultado en Junta
y sacar copia de la base antes de aplicar nada. Se está corrigiendo deuda
registrada de socios reales.

---

## 5. Qué quedó funcionando

- El excedente sobre la cuota **abona a capital**, y las cuotas posteriores se
  recalculan sobre el saldo nuevo con sus intereses correspondientes.
- Solo se rehace lo que viene **después** de la cuota pagada y sigue pendiente.
  Ni lo ya cobrado, ni una cuota anterior vencida, ni las que estén en mora se
  modifican — el interés de una mora ya se causó y no se condona.
- El ajuste opera sobre el **año en curso en adelante**. Los ejercicios cerrados
  ya repartieron sus intereses entre los socios y no se reescriben hacia atrás.
- Si el abono cancela el crédito, las cuotas sobrantes se marcan como prepagadas
  y quedan fuera del cálculo de rentabilidad.
- El **recaudo cuenta el dinero realmente recibido**. Al momento del cambio no
  movió ninguna cifra —las cuotas pagadas coincidían exactamente— pero deja de
  ocultar excedentes de aquí en adelante.
- La lista muestra una columna **"Valor Pagado"** que señala el excedente y qué
  se hizo con él.
- El formulario **avisa antes de guardar** y permite elegir la política.
- El socio recibe una notificación con cuánto abonó a capital y cuánto se
  ahorra en intereses.

### Defectos corregidos en el camino

- El administrador **no podía editar ni crear ningún movimiento negativo** —
  devoluciones, descuentos, distribuciones—. La validación de mora los rechazaba
  siempre, incluso al corregir una observación.
- El formulario de pagos invertía dos campos y, en cada edición, **reescribía el
  total de cuotas del préstamo** con el número de la cuota que se estaba tocando.

---

## 6. Decisiones para la Junta

1. **Ratificar la política por defecto.** Quedó "reducir cuota". Si la Junta
   prefiere "reducir plazo", es un parámetro y se cambia sin desarrollo.

2. **Interés del mes en curso.** Hoy el abono se aplica sobre el interés
   completo del período. El fondo ya usa prorrateo por días en las
   refinanciaciones; convendría unificar el criterio.

3. **Los créditos heredados.** Quedan fuera del ajuste automático hasta que se
   reconstruyan sus cronogramas. Decidir si se repara y con qué alcance.

4. **Comunicación al socio.** Conviene que sepa que puede abonar a capital y que
   puede elegir entre menor cuota o menor plazo.

---

## Nota sobre las cifras

Los valores de este informe se calcularon con la misma fórmula que usa el
generador de cronogramas del sistema y se verificaron contra el servidor en
varios escenarios: préstamo heredado (se niega y explica), abono con cada una de
las dos políticas, abono que cancela el crédito, y pago exacto (no dispara
nada).

El ejemplo usa un crédito de $2.000.000 a 10 cuotas del 1,5% mensual. Los
créditos reales del fondo tienen condiciones distintas; las proporciones se
mantienen.

**Aún no se ha corrido el diagnóstico contra la base de producción.** Hasta
hacerlo no se sabe cuántos créditos son reparables, cuántos requieren decisión
manual, ni cuánto dinero hay hoy sin aplicar a capital. Ese es el primer paso
recomendado.
