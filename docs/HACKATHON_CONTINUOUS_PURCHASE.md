# Compra final del vendedor alojado: preparación y aceptación

Preparación de sólo lectura completada el `2026-10-11T01:03:24.990Z`. La autorización específica de esta compra está pendiente. La compra anterior conserva su transacción, journal y controles consumidos; no se reutilizan para otra operación.

| Condición fijada | Valor |
| --- | --- |
| Bazaar | `633e31e4aaefa5c59b9d19af02c92dc97325f6c9`, preview `ezcuo3lgv`, despliegue `dpl_BFgPRuzqKh3Qv4xQxMmdvs7Y7juM` |
| Vendedor alojado | Preview `https://ai-video-scriptwriter-ejl18kzo8.vercel.app`, `dpl_5uWd5GLtfT2zgfYk9ehbGiRVcwLp`; fuente `04ce8e8aeba348761a86e84a0123f1c490cd1ac96bb2f11f54b586a0a166de9b` |
| Servicio | `guionista-bazaar-pilot-text-funded-v1` — Guion breve algorítmico; entrega de texto, sin video |
| Tarjeta | SHA-256 `c1714ebdf43c10b14016906919f00db4fcedb784a72df0de6e9579edf0195bbf`; ficha activa idéntica a la configuración fijada del worker |
| Compra propuesta | Una ejecución, `0.01 USDC` de Stellar Testnet, máximo `100000` unidades de siete decimales |
| Pagador | `GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU`, firmante local cifrado existente |
| Vendedor receptor | `GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C`; comisión de Bazaar cero en este candidato |
| Tope local propuesto | `1000000` stroops = `0.1 XLM Testnet` de tarifa patrocinada; necesita la nueva autorización |
| Operación nueva reservada localmente | `56e650a6-cd50-4f80-a7ad-323c2b8ee461`; todavía sin orden ni firma |
| Comprador | La cuenta sintética creada desde la página, con agente propio y cero pedidos al preparar la prueba |

La [evidencia de preparación](evidence/continuous-purchase-preparation-2026-10-10.json) registra seis solicitudes MCP de lectura, coincidencia de la ficha y saldos públicos de ambas wallets con USDC autorizado. No abre el firmante ni ejecuta al proveedor. Su propuesta permanece `approved:false`. La [ficha visible](evidence/browser-2026-10-10/continuous-service-approval.jpg) muestra el precio y entrega de texto.

## Secuencia tras autorización específica

1. Fijar una aprobación nueva al UUID, candidato, origen, tarjeta, entrada, precio y wallets indicados. Usar un journal DPAPI y controles independientes de la compra anterior. Antes de crear la orden, confirmar identidades del comprador y vendedor y que no haya otra venta elegible para este worker.
2. Consumir y persistir un control de admisión antes de crear una sola orden mediante MCP; obtener el HTTP 402 de esa orden y verificar red, contrato, destinatario, importe y hashes.
3. Consumir el control durable de pago y guardar la única reserva de gasto antes de abrir el firmante local y autorizar el pago. Si el resultado es incierto, consultar el mismo UUID; no volver a firmar ni enviar un pago.
4. Tras confirmar el pago, revisar nuevamente la cola del vendedor: sólo esta orden debe ser elegible. Consumir un control independiente antes de una invocación manual al worker alojado. Una respuesta perdida se concilia mediante lecturas y conserva el intento.
5. Recuperar la entrega desde MCP y la página del mismo comprador. Comprobar transacción, checksum del texto, referencia, historial y rechazo de otra cuenta; conservar evidencias con los candidatos exactos.

El núcleo de compra local pasó [31 escenarios](../scripts/test-hackathon-one-purchase.mjs) sin solicitudes externas, pagos reales ni lectura de wallets: aprobación exacta, reserva durable antes de firmar, recuperación de respuesta perdida, identidad retirada, reinicio sin volver a pagar y límites de tiempo/tamaño. Estos escenarios no sustituyen la compra alojada pendiente.

La prueba propuesta acepta pago y entrega manual en preview. La programación permanece desactivada y producción requiere su propia autorización y comprobación externa desde el QR. La excepción actual del firewall permite MCP de dos previews protegidas; el pago HTTP de esta prueba sale de la máquina autorizada. No acredita todavía una compra pública desde cualquier agente externo.
