# Compra del vendedor alojado: aceptación de texto en preview

Estado: **compra autorizada, pago confirmado y texto entregado por un tick manual del vendedor alojado en preview protegida**. La operación nueva `56e650a6-cd50-4f80-a7ad-323c2b8ee461` pagó `0.01 USDC` Stellar Testnet; el worker hizo una solicitud al proveedor y una ejecución. La lectura de la entrega y la recuperación del pago conservaron el mismo UUID y transacción, sin otro pago, firma o ejecución. Las evidencias quedaron registradas entre `2026-10-11T01:27:27.990Z` y `2026-10-11T01:27:28.575Z`.

Esta aceptación corresponde al pago, tick manual, entrega, recuperación por MCP y lectura privada en navegador de esa operación en preview. Las comprobaciones independientes de cadena y aislamiento también pasaron, completadas el `2026-10-11T01:29:18.2697297Z`. El [informe consolidado](evidence/continuous-purchase-acceptance-2026-10-10.json) comprueba que las siete evidencias principales corresponden a la misma operación y transacción e incorpora después la lectura del checkpoint cifrado del vendedor. No acepta todavía cron automático, producción ni el recorrido público desde el QR. La compra anterior conserva su transacción, journal y controles consumidos; esta operación usó controles independientes.

| Condición fijada | Valor |
| --- | --- |
| Bazaar | `633e31e4aaefa5c59b9d19af02c92dc97325f6c9`, preview `ezcuo3lgv`, despliegue `dpl_BFgPRuzqKh3Qv4xQxMmdvs7Y7juM` |
| Vendedor alojado | Preview `https://ai-video-scriptwriter-ejl18kzo8.vercel.app`, `dpl_5uWd5GLtfT2zgfYk9ehbGiRVcwLp`; fuente `04ce8e8aeba348761a86e84a0123f1c490cd1ac96bb2f11f54b586a0a166de9b` |
| Servicio | `guionista-bazaar-pilot-text-funded-v1` — Guion breve algorítmico; entrega de texto, sin video |
| Tarjeta | SHA-256 `c1714ebdf43c10b14016906919f00db4fcedb784a72df0de6e9579edf0195bbf`; ficha activa idéntica a la configuración fijada del worker |
| Compra autorizada y realizada | Una ejecución, `0.01 USDC` de Stellar Testnet, máximo `100000` unidades de siete decimales |
| Pagador | `GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU`, firmante local cifrado existente |
| Vendedor receptor | `GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C`; comisión de Bazaar cero en este candidato |
| Tope local autorizado | `1000000` stroops = `0.1 XLM Testnet` para la simulación y recursos del cliente; no garantiza el coste final del facilitador |
| Operación entregada | `56e650a6-cd50-4f80-a7ad-323c2b8ee461` |
| Comprador | La cuenta sintética creada desde la página, con agente propio; generación de comprador `1` y de vendedor `2` tras su rotación legítima |
| Transacción confirmada por Bazaar | `a418e24498a988af98e2e75ed1bbdbde04fe3c9c7133a565416b4915288a97e0` |
| Entrega recuperada | Texto de 484 caracteres; SHA-256 `d9c2535f4f2769c697127c58fadcc0100554c5e40a97bf25a219e66b84cf268b` |
| Vencimiento fijo del contenido | `2026-10-18T01:25:45.918Z`; las lecturas no renuevan este plazo |

La [preparación de sólo lectura](evidence/continuous-purchase-preparation-2026-10-10.json), registrada el `2026-10-11T01:03:24.990Z`, conserva su estado histórico `approved:false`: ocurrió antes de la autorización específica posterior y no abrió el firmante ni ejecutó al proveedor. Sus seis solicitudes MCP comprobaron ficha y saldos públicos. La [ficha visible](evidence/browser-2026-10-10/continuous-service-approval.jpg) muestra el precio y entrega de texto. No se modifica ese informe previo para atribuirle la compra posterior.

## Evidencia de la compra y sus límites

| Etapa | Evidencia real | Resultado |
| --- | --- | --- |
| Pago | [Pago confirmado](evidence/continuous-purchase-payment-2026-10-10.json) | Orden pagada, transacción fijada, admisión y control de pago consumidos; una reserva de gasto |
| Vendedor alojado | [Tick manual](evidence/continuous-purchase-tick-2026-10-10.json) | HTTP `200`, `delivered`, una invocación manual, 11 solicitudes HTTP MCP, ocho herramientas llamadas, una solicitud al proveedor y una ejecución; ningún pago ni firma adicional |
| Entrega privada por MCP | [Verificación de entrega](evidence/continuous-purchase-delivery-2026-10-10.json) | Texto de 484 caracteres, checksum verificado, referencia `bazaar-order:56e650a6-cd50-4f80-a7ad-323c2b8ee461` y perspectiva `purchase` del comprador; ocho solicitudes MCP de lectura |
| Recuperación | [Consulta del pago original](evidence/continuous-purchase-recovery-2026-10-10.json) | Pago confirmado y orden entregada con la misma transacción; una lectura de la orden, cero RPC, firmas, pagos, ticks o ejecuciones adicionales |
| Navegador del comprador | [Informe visual](evidence/continuous-purchase-browser-2026-10-10.json) y [captura](evidence/browser-2026-10-10/continuous-new-purchase-delivered-history.jpg) | Identidad propia, una compra, precio, pagador, destinatario, transacción y texto visibles; consultas propias visibles y URL sin query ni fragmento |
| Cadena independiente | [Lectura RPC y verificación de autorización](evidence/continuous-purchase-chain-2026-10-10.json) | `SUCCESS`, ledger `5131675`, una transferencia USDC de `100000` unidades = `0.01`; pagador y receptor exactos, autorización Ed25519 del comprador verificada |
| Aislamiento de cuentas | [Lecturas cruzadas](evidence/continuous-purchase-isolation-2026-10-10.json) | Cada cuenta lee su compra; acceso cruzado `404` en ambos sentidos; listas de uno/dos pedidos e historiales propios de diez/cuatro consultas con identificadores disjuntos |
| Persistencia del vendedor | [Lectura del checkpoint cifrado](evidence/continuous-purchase-worker-checkpoint-2026-10-10.json) | Un GET de la clave exacta autorizada, desde otro proceso: intento válido, `delivered`, mismo resultado, checksum, transacción y vencimiento; cero escrituras, locks, Lua, ticks o ejecuciones |

Los controles privados de admisión, pago y tick quedaron consumidos. Recuperar esta compra usa consultas del mismo UUID; no vuelve a crearla, firmarla, pagarla ni ejecutar al proveedor. El checksum coincide con un resultado determinista de texto; por sí solo no sustituye la transacción ni la evidencia del nuevo tick. La prueba de aislamiento comprobó el rechazo desde la cuenta anterior y en sentido inverso, sin nuevos pagos, firmas, ticks o ejecuciones.

La lectura adicional de Redis confirma que el resultado del vendedor quedó cifrado y puede recuperarse desde otro proceso. No reinició ni volvió a invocar al worker después de la entrega; no se presenta como una prueba de reinicio alojado de esa compra ni de fallo inducido.

La transacción de cadena es un **fee bump**: el hash exterior `a418e24498a988af98e2e75ed1bbdbde04fe3c9c7133a565416b4915288a97e0` contiene el interior `b37b22891b2a345303d0b98b840de316aa4ab41c36832fd5a4871ccb1646d250`. Son dos identificadores de la misma transacción patrocinada, no dos compras. Se cobraron `23167` stroops = `0.0023167 XLM` a un origen de tarifa distinto del comprador. Esa tarifa de red patrocinada se distingue del precio `0.01 USDC` y de la comisión de Bazaar, que sigue siendo cero. El tope local de simulación no constituye una promesa sobre el coste del facilitador.

El núcleo de compra local pasó [31 escenarios](../scripts/test-hackathon-one-purchase.mjs) sin solicitudes externas, pagos reales ni lectura de wallets: aprobación exacta, reserva durable antes de firmar, recuperación de respuesta perdida, identidad retirada, reinicio sin volver a pagar y límites de tiempo/tamaño. Esas pruebas locales se conservan separadas de los informes reales de esta compra.

## Conexión y recuperación desde QR/MCP

El [QR de revisión](evidence/continuous-preview-qr-2026-10-10.json) apunta a `/demo` de `ezcuo3lgv` y sigue protegido por Vercel. El QR público conserva `https://bazaar.browns.studio/demo`; todavía no acredita este runtime ni una compra pública. La [aceptación del QR](HACKATHON_QR_ACCEPTANCE.md) distingue los dos destinos.

La única conexión de Bazaar para el agente es `https://stellar-bazaar-x402-ezcuo3lgv-cabscryptocontacto-6028s-projects.vercel.app/api/mcp`. Consultar la [guía de conexión](../public/AGENT_CONNECTION.md) para Streamable HTTP y credencial de agente por `Authorization: Bearer`; el acceso protegido de preview se añade únicamente en transporte privado autorizado. Los enlaces de humano y recuperación no se envían como argumentos MCP ni secretos en URLs. Confirmar `get_bazaar_identity`, descubrir el catálogo y recuperar esta orden mediante `get_market_order` con su UUID; en la página, usar `/history` con el acceso humano correspondiente. No enviar otro pago si una lectura del historial falla.

La vinculación previa de wallet sigue siendo opcional; cada orden fija su pagador y condiciones, y la firma se hace localmente. La demo es gratuita de acceso, sin membresía, exclusivamente Testnet; Vercel, Redis y R2 conservan sus cuotas. Las instrucciones de proveedor y las capacidades reales están enlazadas en la misma guía.

## Pendientes del cierre público

- Autorizar producción y activar el cron de cinco minutos; comprobar continuidad del vendedor sin invocación manual.
- Aceptar desde un cliente externo el recorrido público QR → cuenta → MCP → compra → tick → entrega → historial. La excepción de firewall de dos previews y el pago desde la máquina autorizada no acreditan acceso de cualquier agente externo.
- Validar una entrega pagada de imagen/video o archivos R2 con autorización propia. Las cinco variables R2 presentes y sus herramientas no habilitan por sí solas esa función; `privateFiles.enabled:false` y el alcance aceptado continúa siendo texto.

Esta autorización se consumió con la compra documentada. Otra compra exige servicio, cantidad e importe Testnet autorizados por separado. La programación permanece desactivada y producción requiere autorización independiente.
