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

Una compra nueva todavía se ejecuta desde el cliente técnico controlado por el comprador, no desde el navegador. La vista prepara una recuperación privada, pero no la ejecuta ni firma: genera una capability buyer-owned y envía al servidor de Bazaar únicamente su prueba SHA-256. Nunca se debe usar un hash de transacción público como autorización para leer un resultado.

## Gate para declarar “comprar y usar” reutilizable

- Sobre versionado con snapshot/hash de ficha, solicitud/input/idempotencia, recibo, resultado/hash y estado de recuperación.
- Handoff exportable al cliente comprador y retorno por `requestId` + capability de recuperación buyer-owned. Esa capability es secreta como una contraseña, aunque no sea una seed; Bazaar no debe persistirla, registrarla ni incluirla en una URL.
- Reconciliación fail-closed de red, activo, monto, destino, método, ruta, input, recibo y resultado.
- Reintento idempotente que no pueda cobrar dos veces.
- Para async: estados `queued → processing → completed | failed | expired`, límites de intentos y recuperación durable.
- Pruebas de timeout, proveedor caído, respuesta perdida, receipt mismatch, replay y artefacto manipulado.

Commission split y escrow no forman parte de este sprint. El split no resuelve la entrega; escrow solo se evaluará para trabajos diferidos después de cerrar este contrato.

## Handoff y recuperación preparados localmente

Al inspeccionar una compra nueva, el navegador genera:

1. Un `requestId` aleatorio y una capability de recuperación de 256 bits.
2. Un `recoveryProof = SHA-256(capability)` que sí puede viajar al proveedor.
3. Un paquete público `bazaar.delivery-recovery-handoff/v1` para el cliente pagador. Incluye ficha, ruta, `inputHash`, idempotencia, `requestId` y proof; nunca incluye la capability.
4. Una cápsula privada `bazaar.delivery-recovery-capsule/v1` que el comprador descarga explícitamente y guarda como una contraseña. Declara la versión del request del proveedor (`website-intelligence.delivery-recovery/v1`). Tras una entrega pagada, el cliente comprador combina esa cápsula con el `recoveryId` devuelto para construir `{version, recoveryId, requestId, recoveryToken}`. Bazaar no la envía a su API, no usa `localStorage`, no la pone en URLs y no puede restaurarla.

El `402` solo se considera preparado para recuperación cuando la extensión firmable del proveedor devuelve exactamente el mismo `requestId` y `recoveryProof`. Si falta o cambia cualquiera, el flujo falla cerrado antes de autorizar un pago.

El cliente de recuperación fija el origen HTTPS y la ruta del proveedor, rechaza redirects, aplica timeout y reconcilia nuevamente transacción, ledger, red, activo, monto, destino, input, ficha y hash del resultado. Este request no lleva firma de pago y no llama `/verify` ni `/settle`.

El endpoint durable del proveedor y su PR de recuperación deben desplegarse antes de declarar disponible esta recuperación en público. Esta rama solo integra y prueba el contrato con mocks; no ejecuta un pago ni afirma que la producción ya lo soporte.

## Implementación local en esta rama

`bazaar.paid-delivery-envelope/v1` ya normaliza ficha, solicitud, settlement, resultado, recuperación y límites. El cliente técnico de Website Intelligence conserva ahora el resultado y el recibo dentro de ese sobre en vez de descartarlos. La suite local muta cada binding crítico y falla cerrado. El proveedor durable está preparado en una PR separada, pero la recuperación pública sigue desactivada hasta que ambas ramas sean revisadas, fusionadas y desplegadas en el orden correcto.
