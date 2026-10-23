# WorkIn: plan de boletas de honorarios y pago (anotado, aún no construido)

## Intención
Que WorkIn lea las boletas de honorarios RECIBIDAS por la empresa (emitidas por sus trabajadores),
las concilie con los resúmenes de pago y prepare el archivo de nómina bancaria.
WorkIn NO emite boletas y NO mueve dinero.

## Flujo
1. Cerrar período (payment_periods)
2. Resumen por trabajador: lo acepta o disputa (payment_statements)   <- falta construir
3. El trabajador emite su boleta de honorarios en el SII (fuera de WorkIn)
4. Sincronizar boletas recibidas del mes                              <- nuevo
5. Conciliar resumen vs boleta (bruto, retención, líquido)            <- nuevo
6. Lote de pago aprobado por un administrador -> archivo de nómina    <- nuevo

## Decisiones tomadas por defecto (cambiables)
- Primera versión: importar CSV/Excel descargado del portal del SII. Interfaz de proveedor para sumar una API después
  (BaseAPI confirmado como oferente de "BHE recibidas"; Floid, SimpleAPI, LibreDTE y Factronica sin verificar).
- No guardar la clave tributaria de la empresa: se pide en cada sincronización y se descarta.
- Retención: tasa por año en una tabla (2026: 15,25%; 2027: 16%; 2028: 17%, según Buk). Confirmar con el SII.
- Banco: sin definir. Se parte con un CSV genérico y se adapta cuando se sepa el banco.
- Cada empresa elige su modo de pago; honorarios es uno de ellos.

## Tablas nuevas (propuestas)
- honorarium_receipts: empresa, RUT emisor, número, fecha, bruto, retención, líquido, estado, JSON crudo.
  Única por (empresa, RUT emisor, número).
- worker_bank_accounts: banco, tipo, número (cifrado), cargado y confirmado por el trabajador.
- payment_batches y payment_batch_items: lote aprobado, huella del archivo, inmutable y auditado.
- retention_rates: año, tasa.

## Pendiente antes de vender
- Revisión legal: boleta de honorarios vs contrato por obra o faena (riesgo de relación laboral encubierta).
- Confirmar con el SII quién retiene y cómo se declara en el F29.
