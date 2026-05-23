# Resumen de Correcciones Implementadas

Durante las últimas interacciones, se han resuelto varios problemas de la interfaz y de la lógica de negocio para asegurar la calidad de la información del aplicativo *Credifuturo*:

## 1. Corrección de la "Cartera en Mora EP"
El sistema estaba mostrando pagos actuales (del mes que recién empezó) como mora simplemente porque la fecha exacta de cobro caía antes del día de hoy. 
*   **Solución:** Se ajustó la lógica en el Frontend y Backend para considerar como "Mora" únicamente aquellos préstamos cuya fecha máxima de pago sea de un **mes anterior** al actual (corte a día 1º del mes en curso).

## 2. Pestañas y Filtros de Socio sin Duplicados
Al instalar el nuevo filtro desplegable `<select>` para buscar socios rápidamente, el listado mostraba el mismo nombre de cliente repetido multitud de veces (ej: de cada pago "Diana Rojas (P69)", "Diana Rojas (P70)").
*   **Solución:** 
  - Se corrigió la llave única interna (`socioKey`) para que agrupe con exactitud el nombre y la cédula del cliente `Nombre Apellido (Cédula)`, excluyendo el número individual del recibo. La lista ahora es precisa, corta y agrupa todos los pagos.
  - Este comportamiento se replicó exitosamente a la vista secundaria **"Registro Estado Préstamos (Control Pagos)"** manteniéndolas 100% sincronizadas.

## 3. Estado de Préstamos "Pendiente" por Defecto
*   Se configuró la tabla de **"Registro Estado Préstamos"** para que al cargar por primera vez, el filtro de "Estado Préstamo" seleccione de inmediato la opción **"Pendiente"** de forma automática (en lugar de "Todos"), ya que facilita el flujo natural de ir directo a cobrar o revisar las cuentas morosas y activas, en vez de saturar de entrada con préstamos ya liquidados/cancelados.

## 4. Correcciones Administrativas "Bajo el Capó"
*   Se corrigió el error `HTTP 500` que impedía eliminar un pago si éste tenía una imagen (Soporte) adjunta. Ahora la base de datos remueve la imagen correctamente antes de eliminar el registro. 
*   **Diana Rojas:** Ajuste histórico de sus recibos **P69** y **P70**, los cuales registraban por defecto erróneamente `$3.042.000` como "Valor Cuota Variable", siendo reducidos a los valores correctos de acuerdo al interés. También se corrigió el desface del mes (P70 marcaba Septiembre en vez de Marzo).

> [!TIP]
> Cualquier otra validación o lista que desee revisar de otros apartados (como los Ahorros) puede solicitarla libremente.
