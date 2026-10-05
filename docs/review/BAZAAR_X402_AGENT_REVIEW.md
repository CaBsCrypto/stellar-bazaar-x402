# Revisión independiente del candidato x402 por agentes

Fecha: 2026-10-04. Estado: **REVISIÓN LOCAL DE CÓDIGO; ACEPTACIÓN HOSPEDADA PENDIENTE**.

La revisión no encontró un defecto material pendiente de doble liquidación, reutilización de autorización, exposición de la prueba firmada o modificación de registros históricos en los cambios inspeccionados. El ejecutor nativo completó el recorrido local con Next, dobles de Redis/facilitador/RPC y el proveedor algorítmico real; esta revisión inspeccionó su código y evidencia sin relanzarlo en paralelo. No acredita compras hospedadas, captura completa de navegador, recuperación entre despliegues de Vercel ni apertura del piloto.

## Alcance y procedencia

Checkout: `mission-consolidation`. HEAD observado: `98a96dab9a5f9c77b9e74116be1358e837bd95ef`. La revisión inspeccionó el candidato con cambios sin confirmar; este HEAD no identifica por sí solo el contenido nuevo. Es necesario fijar y revisar el SHA final antes de cualquier aceptación hospedada.

Se inspeccionaron los nuevos módulos de liquidación y almacenamiento x402, su ruta HTTP, la extensión de pedidos, la separación del verificador Classic, descubrimiento y ficha de servicio, comprador y trabajador externos, medición, parser de HAR/NetLog, manifiesto, política de rutas, vistas de servicio/historial y los ejecutores nativo/hospedado con sus guards finales.

La revisión no leyó el paquete DPAPI de identidades existentes, no usó credenciales remotas, no modificó Redis o Vercel y no produjo pagos. Sólo escribió este informe y ejecutó comprobaciones offline con dobles y datos sintéticos.

## Propiedades verificadas en código y dobles

- El pedido congela la ficha/hash, entrada/hash, comprador, cuenta pagadora, vendedor, destinatario, importe, identidad oficial USDC testnet y protocolo. El identificador reutilizado con otro contenido produce conflicto. Las sustituciones se rechazan antes de liquidar.
- La prueba firmada queda en `marketPrefix + ':x402-settlements:state'`, separada del pedido visible. El vendedor recibe la entrada del servicio y el comprobante; los DTO de historial y MCP no incluyen el XDR de autorización, su hash privado ni credenciales del comprador.
- Se reserva duraderamente la autorización real por cuenta y nonce antes de verificar/liquidar. Cambiar la envoltura x402 no permite volver a usar esa autorización para otro pedido. El CAS no tiene reintentos automáticos, lease ni caducidad que libere el intento.
- La reserva del pedido y el marcador de liquidación preceden la llamada al facilitador. Un acuse perdido conserva incertidumbre; el mismo POST no repite liquidación. Si existe un hash conocido, la conciliación lee Soroban RPC y comprueba éxito, transferencia SAC exacta y nonce original. Un intento sin hash conserva la evidencia y requiere soporte.
- El backend no confía únicamente en una respuesta positiva del facilitador: valida la transacción confirmada mediante RPC. Los transportes propios usan destinos exactos, límites de tiempo/tamaño, redirects rechazados y cero reintentos automáticos. La actividad interna no expuesta del facilitador no se afirma medida.
- El comprador conserva desafío, inicio de firma, autorización firmada y prueba antes de enviar el pago. El presupuesto conserva reservas ante pérdida de respuesta. La recuperación a un despliegue aprobado sólo lee el pedido y mantiene origen, desafío y firma originales.
- El trabajador conserva el intento antes de ejecutar y el texto/hash antes de entregar. La pérdida del resultado declara incertidumbre; el reenvío explícito del texto conservado no invoca otra vez al proveedor.
- Las fichas y pedidos Classic/XLM sin los nuevos campos conservan lectura y hashes. El verificador Classic rechaza pedidos x402. La pausa bloquea efectos nuevos y mantiene la consulta de registros conservados.
- La exposición del proxy admite únicamente el POST exacto del pedido x402. Las rutas con sufijos, otros métodos y pagos legacy continúan rechazadas por la política de exposición; la autorización del propietario sigue siendo responsabilidad de los handlers.
- Los fixtures del parser devuelven `PASS_PARSER_FIXTURE`, con `captureComplete: false`. El ledger del servidor y la lectura DOM no se transforman en captura nativa. Falta de cuerpos, finales, atribución de jobs o sockets, caché no acreditada, reintentos HTTP o QUIC no cubierto producen fallo.
- La retirada v2 hace GET raw y CAS exacto, conserva campos y hash de la ficha y sólo añade el tombstone. No borra el índice ni referencias. La medición reserva ambas fichas y el índice dentro de un único límite de catálogo; rechaza una tercera ficha, un valor excesivo y cualquier cambio adicional durante retirada. El recorrido v1 conserva su política anterior.
- El ejecutor hospedado comprueba SHA confirmado, fuente/config sin cambios, despliegue protegido y origen exacto antes de leer DPAPI o construir un firmante. Su runtime también vincula hostname y deployment ID dentro del boundary de transporte, impide cabeceras privadas en RPC, serializa MCP/API/proveedor/RPC y conserva los intentos.
- Una respuesta perdida carga el límite reservado y se declara incierta, separándolo del conteo observado. Un marcador PENDING después de un crash se convierte idempotentemente en incertidumbre con su carga conservadora antes de leer las identidades. Los bytes parciales sin evidencia se representan como desconocidos, no como cero observado. La recuperación explícita sólo permite GET y no elimina el lock del efecto original.

## Comprobaciones ejecutadas por esta revisión

Runtime: Node 22.18.0. Todas las comprobaciones siguientes son offline; no constituyen pagos testnet ni captura real.

| Comprobación | Resultado |
| --- | --- |
| `test-marketplace-x402.mjs` | PASS, 61 comprobaciones; dobles de Redis/facilitador/RPC |
| `test-marketplace.mjs` | PASS; USDC Classic, lectura/hash XLM, privacidad, conciliación y pausa |
| `test-guionista-marketplace-worker.mjs` | PASS, 18 escenarios; una llamada al proveedor por ejecución correcta |
| `test-marketplace-x402-discovery.mjs` | PASS; hash anterior y origen del proveedor conservados |
| `test-x402-acceptance-meter.mjs` | PASS; partición de liquidación y contadores externos |
| `test-usdc-acceptance-meter.mjs` | PASS; regresión de claves, límites y transporte protegido |
| `test-marketplace-discovery-meter.mjs` | PASS; scopes reales de API/SSR con doble Redis |
| `test-operation-history-client.mjs` | PASS; incertidumbre y ausencia de reintento de pago |
| `test-x402-browser-capture.mjs` | PASS, 16 escenarios sintéticos; captura nativa false |
| `test-x402-acceptance-manifest.mjs` | PASS, 12 escenarios sintéticos |
| `test-pilot-route-policy.mjs` | PASS; exposición exacta, sin habilitación global de legacy |
| `test-x402-catalog-allocation.mjs` | PASS, 13 escenarios; límite compartido de 4.836 bytes y retirada preservando campos |
| `test-x402-hosted-runner.mjs` | PASS, 18 comprobaciones con dependencias inyectadas; cero lecturas DPAPI reales y cero solicitudes remotas |

La ejecución independiente de `test-marketplace-x402-buyer.mjs` llegó al tramo DPAPI sintético y se detuvo con `DPAPI_UNCONFIRMED` en el sandbox de impersonación sin perfil CurrentUser. No se leyó una identidad real ni se repitió el tramo con privilegios desde esta revisión. El equipo de implementación reportó PASS de la misma comprobación sintética bajo el perfil local autorizado; ese resultado debe conservarse como evidencia de su ejecutor, separado de los PASS independientes anteriores.

## Observación corregida durante la revisión

El gate de ejecución no repetía las condiciones `coverage.httpRetries === 0` y `physicalWireObserved === false` exigidas al preparar el manifiesto. El responsable añadió ambas comprobaciones y casos de reporte contradictorio con hash coincidente; esta revisión repitió el test ampliado de manifiesto y obtuvo PASS. También se corrigieron la aceptación de protocolos distintos de HTTP/HTTPS en loopback, la vinculación de orígenes/despliegues dentro del runtime y la representación de bytes parciales desconocidos. Los manifiestos preparados permanecieron cerrados durante estas correcciones.

El recorrido nativo descubrió que la cota fija de retirada del catálogo anterior no cabía en su asignación compartida. Se sustituyó para v2 por la retirada CAS de valor exacto y la asignación agregada de las dos fichas. El doble nativo emula explícitamente ese CAS; no interpreta su payload como el formato de otros stores.

## Evidencia nativa inspeccionada

`docs/evidence/sprint-x402-agent/native-local.json` registra `PASS_NATIVE_X402_LOCAL`, runtime Node 22.18.0 y BUILD_ID `G7wMlAwcKPuhmFIXJCnpM`. SHA256 de los bytes inspeccionados: `65b044e5964c8f338284ef63f5b6b90506ab78a6f164c5a8bacb617437a736d1`.

| Recurso | Conteo local | Techo |
| --- | ---: | ---: |
| HTTP propios agregados | 87 | 120 |
| Intercambios Redis | 386 | 400 |
| Comandos Redis, cota superior | 1.210 | 2.400 |
| Bytes persistidos proyectados | 44.096 | 49.164 |
| Payloads enviados | 1.413.477 | 16.777.216 |
| Payloads recibidos | 2.316.339 | 33.554.432 |
| Intenciones de pago con dobles | 2 | 2 |

El registro acredita entrega algorítmica única, pago verificado con entrega fallida, aislamiento de un tercer participante, lectura de cuatro pedidos después de sustituir el proceso, pausa compartida, rotación, recuperación por token de Magic Link en el servidor, retirada de ambas fichas y revocación del vendedor conservando acceso e historial del comprador. El comprador usa un diario AES-GCM sintético con fsync real en un directorio temporal y recupera la misma autorización después del reemplazo del proceso; la clave aleatoria sólo existe en memoria. La prueba DPAPI sintética es independiente de ese tramo. Friendbot, trustlines y faucet nuevos son cero. No se movieron fondos.

La proyección de almacenamiento conserva una cota adicional derivada del expediente anterior; no certifica el contenido actual de Redis real. La huella y tamaños Soroban provienen de dobles. Los máximos por request son observaciones locales, no garantías automáticas para RPC vivo. El margen Redis es de 14 intercambios respecto de este recorrido: navegador, aceptación real, recuperación y cierre necesitan reservas revisadas en el manifiesto antes de efectos, sin ampliar límites automáticamente.

El informe mantiene `candidateCommitted: false`, `finalShaRequired: true` y `magicLinkUiGate: PENDING_BROWSER_CAPTURE`. El gate de efectos exige fuente confirmada y la captura nativa; no convierte este PASS local en permiso de ejecución hospedada.

## Condiciones que siguen abiertas

1. Fijar el contenido revisado en un SHA final y completar su binding con compilación y evidencia local. Mantener separadas las garantías observadas de dobles y los límites de transportes vivos.
2. Congelar claves, payloads, destinos exactos, configuración y reservas de navegador, recuperación y cierre en un manifiesto vinculado a ese SHA. Resolver el margen completo antes de pagar.
3. Validar una captura real de Chrome, iniciada antes de navegar, con HAR y NetLog privados. Los fixtures sintéticos y el DOM de CUA no satisfacen este control.
4. Mantener todos los gates de efectos cerrados hasta pasar los controles previos. Después, acreditar como máximo dos compras nuevas y su recuperación exacta junto con los dos pedidos históricos, privacidad, pausa, acceso, móvil, teclado y zoom real al 200 %.
5. Verificar retirada de fichas sintéticas y revocación de A conservando registros y acceso de B. Obtener la revisión de la evidencia final antes de publicar.

El expediente anterior permanece como aceptación parcial. Este informe no autoriza publicación ni sustituye evidencia hospedada faltante.
