# Validación del abono a capital — SOL30 (Gimena Tascón)

**Fecha:** 17 de septiembre de 2026
**Solicitado por:** Vladimir Escobar (Gerente)
**Asunto:** ¿Se recalcularon las cuotas tras el abono a capital del ID_EP #201?

---

## Conclusión

**Sí. El recálculo ya está hecho.** No hay ninguna modificación que aplicar sobre
SOL30, y el sistema no la aplicará porque no queda nada pendiente en ese préstamo.

---

## El caso planteado

| Concepto | Valor |
|---|---|
| Socia | Gimena Tascón |
| Préstamo | SOL30 — vigente |
| Cuota | ID_EP #201 |
| Valor de la cuota | $778.666,67 |
| Valor pagado | $1.000.000,00 |
| **Excedente a capital** | **$221.333,33** |
| Política | Reducir cuota |

Las cifras cuadran con las condiciones del crédito: $8.000.000 a 12 cuotas al
1,4% mensual da un capital por cuota de $666.666,67 más $112.000 de interés
sobre el saldo inicial = **$778.666,67**. Y $1.000.000 − $778.666,67 =
**$221.333,33**. El planteamiento es correcto.

---

## Cómo se verificó

No se pudo consultar la base de producción directamente: el acceso de
mantenimiento (`/api/setup/*`) exige `SETUP_KEY`, que no está definida en
Railway. **La verificación se hizo con la contabilidad que el propio sistema
lleva del barrido nocturno**, que es evidencia de producción y está fechada.

### 1. El barrido llevaba una semana repitiendo el mismo aviso

```
11 sep 01:30 UTC   [ABONOS] Sin abonos pendientes de aplicar
12 sep 01:30 UTC            (8 préstamo(s) con sobrepago revisados,
13 sep 01:30 UTC             6 requieren revisión manual).
14 sep 01:30 UTC
15 sep 01:30 UTC   ← idéntico los siete días
16 sep 01:30 UTC
17 sep 01:30 UTC
```

Decía cuántos, pero no **cuáles**. Sin los nombres no se podía saber si SOL30
era uno de ellos. Se añadió ese detalle al registro (PR #94, solo salida por
consola, no toca ningún dato) y el barrido de arranque lo imprimió.

### 2. Los seis que sí requieren revisión manual

Registro de producción del 17 de septiembre, 01:46:21 UTC:

| Préstamo | Excedente | Motivo del bloqueo |
|---|---|---|
| SOL1 | $803 | Abono de 2025; el ajuste solo opera de 2026 en adelante |
| SOL3 | $170 | Abono de 2025 |
| SOL5 | $218 | Abono de 2025 |
| SOL19 | $200 | El saldo no encadena entre cuotas: carga histórica |
| SOL24 | $600 | No amortiza con capital constante |
| SOL26 | $5.857 | El saldo no encadena entre cuotas: carga histórica |

**SOL30 no está en la lista.** Y los excedentes bloqueados van de $170 a $5.857
— residuos de redondeo de cargas antiguas, no un abono de $221.333.

### 3. Por qué eso prueba que SOL30 ya se recalculó

El barrido clasifica cada préstamo en tres cajas excluyentes:

1. **Candidatos.** La consulta toma, sin criterio alguno, *todo* préstamo con al
   menos una cuota en estado `Pago` cuyo `valorCuotaPago` supere su
   `valorCuotaVariable`. La cuota #201 pagó $1.000.000 sobre $778.666,67, así
   que **SOL30 es necesariamente uno de los 8 candidatos**.
2. **Bloqueados (6).** Ya listados arriba. SOL30 no está.
3. **Pendientes (0).** Ninguno quedó por aplicar.

De 8 candidatos, 6 bloqueados y 0 pendientes quedan **2 «al día»**, y SOL30 es
uno de ellos. «Al día» (`yaAlDia`) significa que `abonosSinAplicar` no encontró
nada que hacer: **el cronograma ya refleja el abono.**

Esa comprobación mira las dos mitades, no una — que la cuota pagada cierre con
el saldo ya rebajado **y** que la cuota siguiente arranque en ese mismo saldo.
Es justo la comprobación que se corrigió a raíz de este mismo préstamo.

---

## Qué debió quedar registrado

SOL30 es el caso que dio origen a la corrección del motor y vive en la suite de
regresión (`server/pruebas_abonos.js`, sección 14: *«El caso real de
producción»*, con las cifras copiadas de la exportación de producción). El
resultado que produce el motor sobre esas cifras exactas, verificado hoy:

| Concepto | Antes | Después |
|---|---|---|
| Saldo de arranque de la cuota 2 | $7.333.333 | **$7.112.000** |
| Valor de la cuota 2 | $769.333 | **$746.113,45** |
| Ahorro en intereses para la socia | — | **$18.592** |

Y el cronograma resultante cumple las cuatro invariantes: el saldo encadena
entre cuotas, el crédito se extingue en cero, el capital amortizado suma el
capital prestado, y el interés de cada cuota corresponde a su saldo por la tasa.

**Comprobar contra la pantalla:** en *Préstamos y Pagos → Pagos*, las cuotas de
SOL30 posteriores a la #201 deben mostrar la cuota rebajada (~$746.113 la
siguiente, y descendiendo) y el saldo inicial de la cuota 2 debe ser
**$7.112.000**, no $7.333.333. Si eso es lo que se ve, la corrección está
aplicada y no hay nada más que hacer.

---

## Lo que sí queda abierto

1. **Los 6 préstamos bloqueados.** Son deuda técnica real, no un error del
   barrido: cada uno tiene una razón legítima para no recalcularse solo, y el
   sistema prefiere no tocar cifras antes que escribir unas que no cuadren. Los
   excedentes son pequeños ($170–$5.857) pero llevan ahí al menos una semana.
   Conviene decidirlos en Junta, uno por uno:
   - **SOL1, SOL3, SOL5** — abonos de 2025. El ejercicio ya repartió sus
     intereses entre los socios; reabrirlo cambiaría un reparto ya hecho.
   - **SOL19, SOL26** — cronogramas de carga histórica que no encadenan. Se
     arreglan revisando el cronograma, no recalculándolo.
   - **SOL24** — no amortiza con capital constante. Recalcularlo le cambiaría
     las condiciones al socio.
2. **`SETUP_KEY` sigue sin definirse en Railway.** Mientras no esté, ninguna
   validación puede leer la base de producción de forma directa: todo lo de este
   informe se dedujo del registro del propio sistema. Es también lo que bloquea
   los préstamos con `fechaPrestamo` dañada, los $14.000 sin cobrar de David
   Camargo y la revisión de préstamos duplicados.

---

## Nota sobre el alcance de esta verificación

La conclusión se apoya en la clasificación que hace el propio barrido sobre los
datos reales de producción, no en una lectura fila a fila del cronograma de
SOL30. La deducción es cerrada —la consulta de candidatos es mecánica y SOL30
cumple su condición por las cifras del propio planteamiento— pero la
comprobación visual descrita arriba la confirma en diez segundos y conviene
hacerla.
