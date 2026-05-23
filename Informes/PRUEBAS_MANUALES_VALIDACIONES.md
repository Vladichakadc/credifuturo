# PRUEBAS MANUALES - VALIDACIONES AUTOM\u00c1TICAS DE AHORROS

## C\u00d3MO EJECUTAR ESTAS PRUEBAS

Abrir el navegador en http://localhost:5173/ e iniciar sesi\u00f3n con:
- Usuario: admin@credifuturo.com
- Contrase\u00f1a: admin123

Ir  al tab **"Registro de Ahorros / Aportes"**

---

## \ud83d\udccb CASO 1: Fecha d\u00eda 10 - Sin Penalizaci\u00f3n

**Datos de Entrada:**
- Socio: (Seleccionar cualquiera)
- Monto: `50000`
- Fecha Pago: `2026-02-10` (D\u00eda 10)
- Tipo: Mensual
- Penalizaci\u00f3n ($): `1000`

**Resultado Esperado:**
- \u2705 D\u00edas P. (Auto): `0` (calculado autom\u00e1ticamente, readonly, fondo gris)
- \u2705 Valor a Penalizar (Auto): `0.00` (calculado, readonly, texto rojo)
- \u2705 Valor Ahorrado (Auto): `50000.00` (calculado, readonly, fondo verde)
- \u2705 Al guardar: mensaje "\u2705 Ahorro registrado exitosamente\nSin penalizaci\u00f3n (registro antes del d\u00eda 10)\nValor human Ahorrado: $50.000"

**Validaci\u00f3n:**
1. Observar que los 3 campos calculados se actualizan instant\u00e1neamente al escribir el monto
2. No se pueden editar manualmente (readonly, cursor not-allowed)
3. Clic "Confirmar Registro"
4. Ver mensaje de confirmaci\u00f3n con detalles
5. El registro aparece en la tabla abajo con Id_VM autogenerado

---

## \ud83d\udccb CASO 2: Fecha d\u00eda 11 - Penalizaci\u00f3n de 1 d\u00eda

**Datos de Entrada:**
- Socio: (Seleccionar cualquiera)
- Monto: `50000`
- Fecha Pago: `2026-02-11` (D\u00eda 11)
- Tipo: Mensual
- Penalizaci\u00f3n ($): `1000`

**Resultado Esperado:**
- \u2705 D\u00edas P. (Auto): `1` (= 11 - 10)
- \u2705 Valor a Penalizar (Auto): `1000.00` (= 1 x $1000)
- \u2705 Valor Ahorrado (Auto): `49000.00` (= $50000 - $1000)
- \u2705 Al guardar: mensaje "\u2705 Ahorro registrado exitosamente\nPenalizaci\u00f3n aplicada: 1 d\u00edas x $1.000 = $1.000\nValor Ahorrado: $49.000"

**Validaci\u00f3n:**
1. Cambiar  la fecha de 2026-02-10 a 2026-02-11
2. Ver que D\u00edas P. cambia instant\u00e1neamente de 0 a 1
3. Ver que Valor a Penalizar cambia a $1000
4. Ver que Valor Ahorrado cambia a $49000 (fondo verde)
5. Guardar y ver mensaje de confirmaci\u00f3n

---

## \ud83d\udccb CASO 3: Fecha d\u00eda 15 - Penalizaci\u00f3n de 5 d\u00edas

**Datos de Entrada:**
- Socio: (Seleccionar cualquiera)
- Monto: `50000`
- Fecha Pago: `2026-02-15` (D\u00eda 15)
- Tipo: Mensual
- Penalizaci\u00f3n ($): `1000`

**Resultado Esperado:**
- \u2705 D\u00edas P. (Auto): `5` (= 15 - 10)
- \u2705 Valor a Penalizar (Auto): `5000.00` (= 5 x $1000)
- \u2705 Valor Ahorrado (Auto): `45000.00` (= $50000 - $5000)
- \u2705 Al guardar: mensaje con "Penalizaci\u00f3n aplicada: 5 d\u00edas x $1.000 = $5.000"

**Validaci\u00f3n:**
1. Escribir fecha 2026-02-15
2. Ver c\u00e1lculos autom\u00e1ticos instant\u00e1neos
3. Guardar registro
4. Verificar en la tabla que muestra $45,000 en la columna Monto

---

## \ud83d\udccb CASO 4: Monto Insuficiente - Validaci\u00f3n de Error

**Datos de Entrada:**
- Socio: (Seleccionar cualquiera)
- Monto: `5000`
- Fecha Pago: `2026-02-20` (D\u00eda 20)
- Tipo: Mensual
- Penalizaci\u00f3n ($): `1000`

**Resultado Esperado:**
- \u26a0\ufe0f D\u00edas P. (Auto): `10` (= 20 - 10)
- \u26a0\ufe0f Valor a Penalizar (Auto): `10000.00` (= 10 x $1000)
- \ud83d\udea8 Valor Ahorrado (Auto): `-5000.00` (fondo ROJO, texto rojo, indica error)
- \ud83d\udea8 Al intentar guardar: mensaje de error "\u26a0\ufe0f MONTO INSUFICIENTE\n\nEl monto ingresado no cubre la penalizaci\u00f3n.\n\nMonto: $5.000\nPenalizaci\u00f3n: $10.000\nD\u00e9ficit: $5.000"
- \ud83d\udea8 NO se guarda el registro

**Validaci\u00f3n:**
1. Escribir monto $5000 y fecha 2026-02-20
2. Ver que Valor Ahorrado se pone ROJO (background rojo, borde rojo)
3. Intentar guardar
4. Ver alerta de error detallada (frontend)
5. Confirmar que NO se cre\u00f3 el registro

**Prueba Backend (Adicional):**
Si se env\u00eda directamente al backend (burlar frontend), tambi\u00e9n rechaza:
- Usar Postman o curl
- Enviar POST http://localhost:3000/api/admin/savings con amount=5000, date=2026-02-20
- Respuesta: HTTP 400 con mensaje de error

---

## \ud83d\udccb CASO 5: Id_VM Consecutivo Autom\u00e1tico

**Procedimiento:**
1. Ir a la tabla "Lista de Ahorros y Aportes Registrados"
2. Observar el \u00faltimo Id_VM (ejemplo: "25")
3. Clic bot\u00f3n "Nuevo" (si estaba editando)
4. Observar el campo "ID_VM (Consecutivo)" en el formulario
5. Debe mostrar autom\u00e1ticamente: "26" (readonly, fondo gris)
6. Crear un nuevo registro (cualquier fecha y monto v\u00e1lidos)
7. Guardar
8. Ver que el nuevo registro aparece en la tabla con Id_VM = "26"
9. Crear otro registro
10. Id_VM ahora debe ser "27"

**Resultado Esperado:**
- \u2705 Id_VM NUNCA se digita manualmente
- \u2705 Id_VM es readonly (no editable)
- \u2705 Id_VM se genera autom\u00e1ticamente como \u00faltimo+1
- \u2705 Si la BD est\u00e1 vac\u00eda, inicia en "1"
- \u2705 No permite duplicados (constraint UNIQUE)
- \u2705 Al editar un registro existente, Id_VM NO cambia

---

## \ud83d\udccb CASO 6: Modificar Registro - Recalcula Penalizaci\u00f3n

**Procedimiento:**
1. En la tabla, buscar un registro existente
2. Clic bot\u00f3n "\u270f\ufe0f Modificar"
3. El formulario se llena con los datos del registro
4. Cambiar la "Fecha Pago" a un d\u00eda > 10 (ejemplo: 2026-02-18)
5. Observar que los campos calculados se actualizan INSTANT\u00c1NEAMENTE
6. Cambiar el "Monto" (ejemplo: de $50000 a $60000)
7. Observar nuevo c\u00e1lculo autom\u00e1tico
8. Clic "Actualizar Ahorro"
9. Ver mensaje "\u2705 Ahorro actualizado exitosamente"
10. El registro en la tabla refleja los nuevos valores

**Resultado Esperado:**
- \u2705 Al editar, TODOS los c\u00e1lculos se rehacen autom\u00e1ticamente
- \u2705 El backend recalcula (no conf\u00eda en el cliente)
- \u2705 Los cambios persisten en la base de datos
- \u2705 El Id_VM permanece igual (NO se modifica)

---

## \ud83d\udccb CASO 7: Reportes Muestran Valores Persistidos

**Procedimiento:**
1. Crear algunos registros con diferentes fechas y montos
2. Cerrar COMPLETAMENTE la aplicaci\u00f3n (navegador)
3. Cerrar el servidor backend (Ctrl+C en terminal)
4. Reiniciar servidor: `npm start` en `C:\Credifuturo\Credifuturo-Web\server`
5. Abrir navegador nuevamente y hacer login
6. Ir al tab "Registro de Ahorros / Aportes"
7. Scroll abajo a la tabla

**Resultado Esperado:**
- \u2705 La tabla muestra EXACTAMENTE los mismos valores que se guardaron
- \u2705 Id_VM, D\u00edas P., Valor a Penalizar, Valor Ahorrado coinciden
- \u2705 NO hay "datos fantasma" ni c\u00e1lculos incorrectos
- \u2705 Los report es/tablas leen desde la BASE DE DATOS, no desde memoria

**Verificaci\u00f3n Adicional (Exportar Excel):**
1. Clic bot\u00f3n "Exportar Excel" en la tabla de ahorros
2. Abrir el archivo descargado
3. Verificar que los valores en Excel coinciden con la BD

---

## \u2705 CHECKLIST DE ACEPTACI\u00d3N

Marcar (\u2713) al completar cada validaci\u00f3n:

### Funcionalidad B\u00e1sica
- [ ] Id_VM es consecutivo autom\u00e1tico (\u00faltimo + 1)
- [ ] Id_VM readonly (no editable manualmente)
- [ ] Id_VM inicia en "1" si la BD est\u00e1 vac\u00eda
- [ ] Constraint UNIQUE previene duplicados

### C\u00e1lculos Autom\u00e1ticos
- [ ] D\u00edas P. se calcula autom\u00e1ticamente si fecha > d\u00eda 10
- [ ] D\u00edas P. = 0 si fecha \u2264 d\u00eda 10
- [ ] Valor a Penalizar = D\u00edas P. x Penalizaci\u00f3n($)
- [ ] Valor Ahorrado = Monto - Valor a Penalizar
- [ ] C\u00e1lculos son INSTANT\u00c1NEOS al cambiar fecha/monto

### UI/UX
- [ ] Campos calculados son readonly (no editables)
- [ ] Campos calculados tienen fondo gris distintivo
- [ ] Valor Ahorrado cambia a rojo si es negativo
- [ ] Tooltips muestran "Calculado autom\u00e1ticamente"
- [ ] Labels dicen "(Auto)" para campos calculados

### Validaciones
- [ ] Rechaza guardar si Valor Ahorrado < 0 (front end)
- [ ] Rechaza guardar si Valor Ahorrado < 0 (backend)
- [ ] Mensaje de error claro y detallado
- [ ] Muestra d\u00e9ficit exacto en mensaje de error

### Backend
- [ ] Backend RECALCULA siempre (ignora valores del cliente)
- [ ] Backend valida monto suficiente
- [ ] Backend genera Id_VM consecutivo
- [ ] Backend persiste valores calculados en BD
- [ ] Backend retorna mensaje con detalles de penalizaci\u00f3n

### Persistencia
- [ ] Valores se guardan en base de datos
- [ ] Al reiniciar app, valores persisten
- [ ] Reportes/tablas leen desde BD
- [ ] Exportar Excel muestra valores correctos

### Edici\u00f3n
- [ ] Al modificar registro, recalcula penalizaci\u00f3n
- [ ] Id_VM NO cambia al editar
- [ ] Cambios en fecha/monto recalculan instant\u00e1neamente

---

## \ud83d\udcca RESULTADOS ESPERADOS POR CASO

| Caso | D\u00eda | Monto | Penaliz. | D\u00edas P. | Valor Penalizar | Valor Ahorrado | Estado |
|------|-----|-------|----------|---------|----------------|---------------|--------|
| 1    | 10  | 50000 | 1000     | 0       | 0              | 50000         | \u2705 OK   |
| 2    | 11  | 50000 | 1000     | 1       | 1000           | 49000         | \u2705 OK   |
| 3    | 15  | 50000 | 1000     | 5       | 5000           | 45000         | \u2705 OK   |
| 4    | 20  | 5000  | 1000     | 10      | 10000          | -5000         | \ud83d\udea8 ERROR |
| 5    | -   | -     | -        | -       | -              | -             | \u2705 Consec. |

---

## \ud83d\udd27 TROUBLESHOOTING

**Problema:** Los c\u00e1lculos no se actualizan autom\u00e1ticamente
- **Soluci\u00f3n:** Refrescar navegador (F5), verificar que JavaScript est\u00e1 habilitado

**Problema:** Al guardar dice "Error al procesar ahorro"
- **Soluci\u00f3n:** Verificar que el servidor backend est\u00e1 corriendo en puerto 3000

**Problema:** Id_VM se repite o no es consecutivo
- **Soluci\u00f3n:** El constraint UNIQUE debe rechazar duplicados. Si pasa, verificar migraci\u00f3n de BD.

**Problema:** Valor Ahorrado negativo pero a\u00fan se guarda
- **Soluci\u00f3n:** BUG - reportar. Debe bloquear en frontend AND backend.

---

**Fecha de Pruebas:** ___________________  
**Probado Por:** ___________________  
**Resultado Global:** \u2705 APROBADO / \u274c FALLIDO  
**Observaciones:**

_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
