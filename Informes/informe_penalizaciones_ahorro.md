# Informe de Validación y Cálculo de Penalización de Ahorros

Este documento detalla la lógica de negocio implementada en **CREDIFUTURO** para el cálculo de penalizaciones por mora en los ahorros mensuales. El sistema realiza estos cálculos tanto en el formulario visual (Frontend en React) para informar al usuario, como en la API (Backend en Node.js) para mantener la integridad de los datos.

## 1. Reglas Generales de Penalización

La regla fundamental de negocio estipula que los aportes mensuales deben realizarse, como máximo, el **día 10 de cada mes**.

*   **Periodo de Gracia:** Del día 1 al día 10 del mes (inclusive). No genera penalidad (`diasPenalizacion = 0`).
*   **Tarifa de Mora:** Constante de **$1.000 COP** por cada día de retraso (`PENALIZACION_DIARIA = 1000`).

## 2. Escenarios de Pago y Fórmulas Base

Dependiendo de la relación entre la **Fecha del Pago** y el **Mes al que se aplica el abono**, el sistema determina la penalización a través de tres vías:

### A. Pago a Tiempo o Adelantado
Si el socio está abonando a un mes posterior al actual, o abona al mes en curso antes del día 11:
*   `Penalización`: **NO**
*   `Días de Penalización`: **0**
*   `Valor a Penalizar`: **$0**

### B. Pago en el Mes Corriente con Retraso
Si el abono es para el mes en curso, pero la fecha de pago excede el periodo de gracia (ej. paga el 15 de marzo correspondiente a marzo).
*   **Días de Penalización:** `(Día de pago) - 10`
    *(Ej: Si paga el 15, `15 - 10 = 5 días`)*
*   **Valor a Penalizar:** `Días * $1.000`

### C. Pago Atrasado (De meses anteriores)
Si el socio paga una cuota de un mes que ya pasó (ej. abona a febrero estando en abril). El sistema calcula todos los días corridos desde el día 10 de ese mes adeudado, hasta la fecha exacta en la que hace el pago.
*   **Fecha Límite (Target Date):** `Día 10` del `Mes adeudado`
*   **Días de Penalización:** Diferencia total en días entre la `Fecha Límite` y la `Fecha actual de pago`.
*   **Valor a Penalizar:** `Diferencia de días * $1.000`

## 3. Validación de Inactividad (Solo Formularios / Frontend)

En el archivo `SavingsPage.jsx` (al momento de abrir la ventana modal para "Nuevo Ahorro"), el sistema realiza una validación extra conocida como **Dormant Info** o detección de inactividad:

1.  Verifica si el socio **no tiene ningún ahorro** mensual registrado en el año actual.
2.  Si es así, recorre todos los meses transcurridos desde enero.
3.  Si ha pasado el día 10 de alguno de esos meses sin registro, calcula una mora acumulada gigante desde la primera fecha límite violada.
4.  Si esta **Mora Acumulada Inactiva** resulta ser mayor a la mora individual del mes que se intenta pagar, la **sobrescribe** y obliga a pagar la totalidad del tiempo perdido.
5.  En pantalla se despliega una **alerta roja** informando los meses exactos que el usuario ha faltado.

## 4. Validación de Suficiencia de Fondos (Backend)

La integridad financiera se asegura a nivel de base de datos en `admin.js`.
Una vez se recibe el requerimiento, la API realiza su propio cálculo y ejecuta la siguiente validación de control:

```javascript
const valorAhorrado = montoIngresado - valorAPenalizar;

if (valorAhorrado < 0) {
    // Retorna Error 400
}
```

**Regla Estricta:** Si el socio entrega un billete o hace una transferencia cuyo monto **NO CUBRE** siquiera el costo de su propia penalización, la transacción es rechazada automáticamente. El servidor responde: *"El Valor Mensual no cubre la penalización"* y obliga al administrador a registrar un monto mayor.

## 5. Destino del Dinero

Gracias a esta fórmula, el sistema descompone automáticamente cada transacción:
*   **Monto Original (`amount`):** Lo que ingresa físicamente al banco o caja.
*   **Valor a Penalizar (`valorAPenalizar`):** La porción del dinero que el fondo de CREDIFUTURO retiene como multa.
*   **Valor Ahorrado (`valorAhorrado`):** Lo que genuinamente incrementa el saldo a favor del socio.
