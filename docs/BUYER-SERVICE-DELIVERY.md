# Entrega de servicios / Service delivery

## Qué ocurre después del pago

Bazaar descubre el servicio y muestra sus términos. El comprador prepara la entrada y recibe el `402`. La autorización ocurre en un cliente controlado por el comprador; Bazaar no recibe ni almacena claves. El proveedor liquida el pago mediante el facilitador, ejecuta el servicio y devuelve **resultado + hash + recibo**. El producto futuro solo deberá mostrar “entregado y reconciliado” cuando esas piezas correspondan a la misma solicitud.

1. **Ficha / Service card:** método, ruta, entrada, red, activo, monto y destino.
2. **402 recibido / Terms inspected:** el comprador revisa los bindings antes de autorizar.
3. **Pago liquidado / Settlement:** el cliente del comprador firma; Bazaar no firma ni custodia.
4. **Entrega / Delivery:** el proveedor devuelve texto/JSON síncrono o un `jobId` asíncrono.
5. **Reconciliación / Reconciliation:** solicitud, recibo y hash del resultado deben coincidir o la vista falla cerrado.

## Lo que funciona hoy

- Website Intelligence tiene evidencia registrada de una compra real en Stellar Testnet por `0.001 USDC`, con resultado estructurado y recibo. Esta vista comprueba el hash del resultado y los valores esperados del sobre, pero no vuelve a consultar el ledger.
- El workspace puede inspeccionar un `402` público sin pagar y puede mostrar/exportar la entrega histórica verificada.
- Los fixtures locales demuestran entrega síncrona de texto y un ciclo asíncrono `processing → completed` con manifiesto de artefacto. El video es metadata de prueba: no se sube ni edita un archivo real.

## Límite actual

Una compra nueva todavía se ejecuta desde el cliente técnico controlado por el comprador, no desde el navegador. La vista tampoco recupera una entrega privada usando solo un `requestId`: el proveedor necesita un mecanismo durable y autorizado con un identificador opaco o credencial de recuperación buyer-owned. Nunca se debe usar un hash de transacción público como autorización para leer un resultado.

## Gate para declarar “comprar y usar” reutilizable

- Sobre versionado con snapshot/hash de ficha, solicitud/input/idempotencia, recibo, resultado/hash y estado de recuperación.
- Handoff exportable al cliente comprador y retorno por `requestId` + capability de recuperación buyer-owned. Esa capability es secreta como una contraseña, aunque no sea una seed; Bazaar no debe persistirla, registrarla ni incluirla en una URL.
- Reconciliación fail-closed de red, activo, monto, destino, método, ruta, input, recibo y resultado.
- Reintento idempotente que no pueda cobrar dos veces.
- Para async: estados `queued → processing → completed | failed | expired`, límites de intentos y recuperación durable.
- Pruebas de timeout, proveedor caído, respuesta perdida, receipt mismatch, replay y artefacto manipulado.

Commission split y escrow no forman parte de este sprint. El split no resuelve la entrega; escrow solo se evaluará para trabajos diferidos después de cerrar este contrato.

## Implementación local en esta rama

`bazaar.paid-delivery-envelope/v1` ya normaliza ficha, solicitud, settlement, resultado, recuperación y límites. El cliente técnico de Website Intelligence conserva ahora el resultado y el recibo dentro de ese sobre en vez de descartarlos. La suite local muta cada binding crítico y falla cerrado. La recuperación real sigue desactivada hasta que el proveedor implemente almacenamiento durable y una capability buyer-owned; el sobre declara por ahora `recovery.available=false`.
