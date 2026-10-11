# Vendedor continuo para la demo de texto

Estado: **tick ocioso alojado, reinicio y concurrencia comprobados en preview protegida**. La excepción de firewall fue autorizada, aplicada y leída de nuevo; el bloqueo anterior por IP quedó resuelto para los dos hosts de preview y `/api/mcp`. El worker completó las pruebas con cero solicitudes al proveedor, ejecuciones, órdenes o pagos nuevos. Todavía falta una orden pagada y entregada por este worker, con autorización específica. Su cron cada cinco minutos no está activo en preview y la programación pública queda en **standby** hasta autorizar producción. La [compra de texto anterior](evidence/hackathon-paid-text-preview-2026-10-10.json) acreditó una ejecución acotada de otro corte; no se atribuye al worker nuevo. La [aceptación del QR](HACKATHON_QR_ACCEPTANCE.md) conserva esa distinción.

Preview final del proveedor: `https://ai-video-scriptwriter-ejl18kzo8.vercel.app`, despliegue `dpl_5uWd5GLtfT2zgfYk9ehbGiRVcwLp`, fuente SHA-256 `04ce8e8aeba348761a86e84a0123f1c490cd1ac96bb2f11f54b586a0a166de9b`. [Informe de despliegue](evidence/continuous-seller-preview-deployment-2026-10-10.json): READY, alias existente conservado, cron automático de preview desactivado, producción y pagos nuevos en cero. Es otro proyecto, distinto de Bazaar y su QR público.

Bazaar usa el candidato `633e31e4aaefa5c59b9d19af02c92dc97325f6c9` en `https://stellar-bazaar-x402-ezcuo3lgv-cabscryptocontacto-6028s-projects.vercel.app`, despliegue `dpl_BFgPRuzqKh3Qv4xQxMmdvs7Y7juM`. [Configuración del corte](evidence/continuous-bazaar-preview-2026-10-10.json): mismos namespaces sintéticos, configuración de la compra original conservada y texto como único alcance. Las evidencias corresponden a esos artefactos fijados; un commit posterior de documentación no cambia el código desplegado ni amplía lo que pasó. El [baseline de `6jo39edlm`](evidence/continuous-seller-hosted-baseline-2026-10-10.json) y el [pago original `4f250cd`](evidence/hackathon-paid-text-preview-2026-10-10.json) se conservan con sus propios informes.

## Alcance elegido

Reutilizar el proyecto existente del proveedor para un tick externo breve. Bazaar sigue siendo catálogo, orden, pago verificado e historial; el agente y el adaptador de texto se ejecutan en el alojamiento del proveedor. Su única conexión con Bazaar es MCP Streamable HTTP en `/api/mcp` del origen fijado. No incorpora seeds, firmantes, pagos ni credenciales de comprador. El vendedor recibe directamente el USDC Testnet del precio de su ficha; la comisión de Bazaar en este candidato es cero.

La programación inicial elegida es `*/5 * * * *`: un tick cada cinco minutos, como máximo una orden por tick y 50 ejecuciones de proveedor por día, con un máximo de 5.000 solicitudes MCP del worker al día. Las pruebas offline comprueban estos límites; las pruebas alojadas aceptan autenticación, idle, reinicio y exclusión de ticks superpuestos. La cuota bajo carga y una entrega nueva siguen pendientes. Los límites son independientes de las cuotas de Bazaar y del alojamiento. El tick conserva diario cifrado en Redis, locks atómicos y el intento original de cada operación. Reutiliza espacios aislados en preview; nunca altera el despliegue o la configuración de la compra anterior para simular otro pago.

La demo aceptará inicialmente **texto**. Imagen/video y entregas R2 pagadas siguen fuera de la evidencia de cierre. La presencia de las herramientas de archivos no acredita que ese recorrido haya pasado una compra alojada.

## Contrato de ejecución y recuperación

1. Comprobar configuración, origen, identidad propia, ficha activa, almacenamiento durable y capacidades. Un permiso de publicación no equivale a una orden pagada.
2. Adquirir el lock del tick y continuar el cursor guardado. Las invocaciones superpuestas o duplicadas no reinician contadores ni crean otro intento.
3. Seleccionar sólo una orden propia pendiente de ejecución. Verificar pago, proveedor, hashes, entrada y versión de ficha antes de reclamar el `attemptId` conservado. Una orden ya entregada se reconoce sin ejecutar.
4. Reservar el límite diario y guardar el marcador de ejecución antes del efecto externo. Conservar el texto y checksum antes de entregarlo por MCP.
5. Ante pérdida de respuesta, conciliar el mismo UUID e intento. Un resultado congelado puede recuperarse o reenviarse de forma explícita; una ejecución incierta requiere revisión y no vuelve a ejecutar al proveedor.
6. Respetar `429` y `Retry-After`. Redis indisponible, journal inválido, lock pendiente o capacidad agotada cierran la ejecución con incidente visible. Conservar recuperación de obligaciones existentes cuando se cierre la admisión.

El estado operativo debe permitir distinguir standby, tick confirmado, contención de lock, cuota, entrega pendiente e incertidumbre. La evidencia incluye hora del último tick, cursor, contadores y motivo de suspensión, sin accesos, prompts ni contenido privado. El diario de ejecución debe respetar la retención del contenido; los controles mínimos para reconciliar una operación incierta no se borran indiscriminadamente a los siete días.

## Programación y consumo

La revisión de sólo lectura del equipo y sus dos proyectos confirmó **Pro** el `2026-10-11T00:07:23Z` (10 de octubre, 21:07 en Santiago), sin cambio de plan. El intervalo mínimo de un minuto es elegible en ese plan; esta comprobación no activa la programación. Vercel limita Hobby a una ejecución diaria y los cron consumen las cuotas de Functions. No contratar un plan ni aumentar presupuestos para esta implementación. [Uso y precios oficiales de Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

La programación no garantiza entrega exactamente una vez: puede omitir o duplicar invocaciones y solaparlas. Vercel no reintenta un fallo; se necesitan locks y reconciliación idempotente. El endpoint de tick debe exigir su acceso privado, rechazar redirecciones y tener duración acotada. [Gestión oficial de Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

La medición **offline** usa el SDK MCP real y el store cifrado AES/CAS con un doble de comandos Redis REST. Un tick ocioso hace cinco solicitudes HTTP MCP: `initialize`, `notifications/initialized`, el intento SSE GET que recibe `405`, identidad y listado. El primer tick hace 32 llamadas Redis REST y los siguientes 31. No son comandos Lua ejecutados en Upstash ni telemetría alojada; el modelo anterior de cuatro solicitudes MCP se corrige con esta medición.

La [medición alojada final](evidence/continuous-seller-hosted-preview-2026-10-10.json) confirmó después esos contadores: cinco HTTP MCP y 32 comandos Redis para idle inicial, cinco y 31 al reiniciar. La proyección mensual siguiente continúa siendo una estimación: las invocaciones manuales no acreditan un mes de consumo ni facturación Lua.

| Cadencia comparada | Ticks/día | HTTP MCP ocioso/día | Redis REST ocioso/día | Redis REST ocioso/30 días |
| --- | ---: | ---: | ---: | ---: |
| Cada cinco minutos: candidata inicial | 288 | 1.440 | 8.928 | 267.840 |
| Cada dos minutos: alternativa descartada para este corte | 720 | 3.600 | 22.320 | 669.600 |

Las proyecciones usan el tick caliente de 31 llamadas; el primer tick añade una llamada. Se calculan antes de ejecuciones, reintentos, recuperación y consumo de compradores/Bazaar. Mantener el tope de 5.000 HTTP MCP del worker y 50 ejecuciones/día no reserva por sí solo capacidad en Redis. Medir el consumo real antes de activar el schedule y confrontarlo con las cuotas vigentes: 60 solicitudes autenticadas por cuenta/minuto, 120 de ingreso globales/minuto y el límite diario efectivo de Bazaar. No equiparar llamadas REST estimadas con unidades facturadas de Lua o del panel.

La sesión de Upstash ya está abierta y la base existente se verificó en plan **Free**, con aproximadamente 11 mil comandos usados de 500 mil/mes, importe observado de $0 y TLS activo. El panel también mostró 14 MB/10 GB y 100 KB/238 MB; registrar sus métricas completas en la evidencia de capacidad del candidato. La proyección a cinco minutos requiere confrontar el consumo combinado y medido con ese plan; no supone que quede reservada su cuota restante. No se contrató ni amplió un plan.

Una orden recién pagada puede esperar al siguiente tick, hasta aproximadamente cinco minutos de programación más duración de ejecución y entrega, sin promesa de SLA. Una cuota, fallo, lock o invocación omitida puede extender la espera; el comprador consulta el mismo pedido y no vuelve a pagar. Un backlog puede tardar varios ticks por el límite de una orden por tick.

La preview se valida mediante **ticks manuales**, sin programar su cron. El origen protegido exige acceso de despliegue autorizado por separado, exclusivamente en transporte privado y limitado a ese origen. El token del agente de Bazaar no elimina la protección de Vercel. La configuración pública o un QR jamás incluye esa credencial.

El usuario autorizó expresamente guardar la copia local del token de prueba mediante DPAPI CurrentUser, con ACL del dueño y SYSTEM y sin archivo claro. Esa autorización resolvió el bloqueo anterior de revisión automática para el guardado local; no autoriza transferir la credencial principal a Vercel. La primera prueba Redis real pasó 17 comprobaciones entre `2026-10-11T00:24:11.595Z` y `2026-10-11T00:24:17.870Z`, con 36 peticiones REST en un namespace sintético nuevo y limpieza de sus claves exactas, cero pagos y órdenes. Ese corte anterior no se confunde con la validación del acceso limitado siguiente.

Ya se creó el acceso Upstash ACL limitado a `bazaar-seller:preview-2dea99ac5bc7c7b0896f57f97d94adaa:*`, destinado al worker de preview. Su [evidencia real sanitizada](evidence/continuous-seller-redis-2026-10-10.json), completada el `2026-10-11T00:34:02.146Z`, contiene **17 comprobaciones del contrato y cuatro denegaciones**, 40 peticiones REST en total. Comprueba payload cifrado, vencimiento fijo, control mínimo después del vencimiento y fencing; deniega GET/EVAL fuera del alcance, EVAL con clave dinámica fuera del alcance y DBSIZE. No leyó otras claves de Bazaar ni transfirió el token principal. Las 17 pruebas reales son distintas de las 13 offline. No copiar valores de accesos o archivos privados al informe público.

El [primer diagnóstico](evidence/continuous-seller-connection-diagnostic-2026-10-10.json) conserva el corte anterior `9881bpz2v`: tick HTTP `503`/unconfirmed, una solicitud MCP, diez comandos Redis, cero solicitudes al proveedor y cero ejecuciones. La integración **desde esta máquina** sí pasó un tick ocioso con el SDK nativo contra Bazaar protegido y Redis real: cinco solicitudes MCP y 31 comandos Redis, cero solicitudes al proveedor/ejecuciones. Ese resultado ayuda a aislar el bloqueo por IP; no acepta la ejecución desde el alojamiento externo ni se atribuye a la preview nueva.

La revisión de sólo lectura confirmó la regla **Bazaar acceptance egress only** como causa previa del HTTP MCP `403` desde el vendedor alojado. La [excepción de firewall](evidence/preview-mcp-firewall-review-2026-10-10.json) fue autorizada, aplicada y leída de nuevo el `2026-10-11T00:51:56.437Z`: sólo `/api/mcp` en los hosts exactos `6jo39edlm` y `ezcuo3lgv`. Se conservaron protección de despliegue, autenticación de aplicación y regla de producción. Esa excepción no convierte la preview en pública ni autoriza un pago.

El [probe alojado final](evidence/continuous-seller-hosted-preview-2026-10-10.json) pasó el `2026-10-11T00:59:00.991Z` desde `ejl18kzo8` hacia `ezcuo3lgv`: sin acceso y token erróneo devuelven `401`; query y origen no permitidos devuelven `400`; idle inicial y reinicio devuelven `200`, con checkpoint persistido. Ambos ticks usaron cinco HTTP MCP; el primero 32 comandos Redis y el reinicio 31. No hubo solicitudes al proveedor, ejecuciones ni pagos.

La [concurrencia alojada final](evidence/continuous-seller-concurrency-2026-10-10.json) pasó el `2026-10-11T00:59:19.830Z`: una invocación quedó idle, cinco HTTP MCP, 31 comandos Redis y `dayTicks:3`; la segunda quedó locked, cero HTTP MCP y un comando Redis. Ambas devolvieron `200`, sin solicitudes al proveedor, ejecuciones o pagos. El lock excluyó el segundo tick. No hubo nuevas cuentas u órdenes, cron programado, Git push ni publicación de producción. La prueba de una nueva orden pagada y ejecutada por este worker sigue pendiente de autorización específica.

El [SDK nativo de Bazaar](evidence/continuous-bazaar-sdk-2026-10-10.json) descubrió 34 herramientas y completó 16 solicitudes HTTP en el candidato `633e31e`: identidad, historial privado, checksum de la orden anterior, `404` a la cuenta ajena y consultas aisladas. Las cinco variables R2 están presentes, pero `privateFiles.enabled:false`; se mantiene texto como único alcance. La configuración señala esa función deshabilitada y no declara completa la aceptación de archivos o automatización pública.

## Corte de pruebas y aceptación del nuevo tick

| Comprobación | Evidencia y alcance | Estado actual |
| --- | --- | --- |
| Core del tick offline | SDK nativo con transporte sintético: límites, intentos durables, recuperación, vencimiento, no repetición y diagnóstico de transporte | PASS: 61 comprobaciones; cero solicitudes externas/pagos |
| Handler offline | Autenticación, límite de duración, configuración y respuesta | PASS: 28 comprobaciones; no prueba la conexión alojada |
| Store offline | AES/CAS y contrato con doble de comandos; no ejecutó Lua en Redis real | PASS: 13 comprobaciones |
| Paquete del proveedor offline | Preparación y límites del paquete desplegable | PASS: 40 comprobaciones |
| Proveedor Express offline | Ruta de ejecución del proveedor con datos sintéticos | PASS: 8 comprobaciones |
| Regresiones locales | Kit externo, supervisor y adaptador guionista | PASS: 47, 34 y 18 respectivamente |
| Compilación | Builds de Bazaar y del proyecto proveedor | PASS local; no prueba runtime alojado |
| Preview preparada y cron desactivado | Proyecto externo `ai-video-scriptwriter`, `dpl_5uWd5GLtfT2zgfYk9ehbGiRVcwLp`, fuente fijada, sin cambio de alias/producción | READY; conexión ociosa alojada PASS |
| Redis real con ACL limitada | [Contrato y rechazo de accesos ajenos](evidence/continuous-seller-redis-2026-10-10.json); 40 peticiones REST, cero pagos/órdenes, sin token principal transferido | PASS: 17 contrato + 4 denegaciones, `2026-10-11T00:34:02.146Z` |
| Tick con Redis real desde esta máquina | SDK nativo y checkpoint cifrado; cinco HTTP MCP, 31 comandos Redis, cero efectos de proveedor | PASS idle en el corte anterior; no acredita alojamiento externo |
| Excepción de firewall | Sólo `/api/mcp` en `6jo39edlm` y `ezcuo3lgv`, protección y autenticación conservadas | Autorizada, aplicada y readback PASS; producción conservada |
| Tick manual alojado | [Probe final](evidence/continuous-seller-hosted-preview-2026-10-10.json): `401/401/400/400`, idle y reinicio `200`, sin efectos de proveedor | PASS ocioso: cinco MCP, 32 Redis inicial/31 reinicio |
| Orden anterior conservada | Tick no repite entrega anterior; SDK verifica mismo texto y checksum, navegador recupera compra previa | PASS de lectura/no repetición; no es una entrega del worker nuevo |
| Solapamiento/reinicio | [Dos ticks concurrentes](evidence/continuous-seller-concurrency-2026-10-10.json): uno idle y otro locked, cero ejecuciones; reinicio conserva checkpoint | PASS alojado en preview |
| Cuotas e indisponibilidad alojadas | Datos sintéticos aislados: máximo una orden/tick, 50/día, `429`, almacenamiento caído y respuesta perdida | Offline PASS; alojado pendiente |
| Recuperación incierta alojada | Conservar intento y resultado; no pagar ni ejecutar otra vez | Offline PASS; alojado pendiente |
| Nueva orden pagada | Servicio, cantidad e importe autorizados por separado; pago → tick → texto → historial | Pendiente de autorización y prueba |
| Programación pública | Producción autorizada, primer tick y observación de continuidad sin operador | Pendiente de autorización y prueba |

Actualizar esta tabla sólo con informe que fije candidato, entorno, datos sintéticos, comandos y resultados. Pruebas locales de fallos no son evidencia de producción. La autorización de la compra anterior ya se consumió: no autoriza otra orden pagada, aunque sea Testnet.

## Puerta de producción

Presentar el candidato final de Bazaar y del proveedor, configuración efectiva, límites, resultados de preview, consumo estimado y rollback. Solicitar autorización para publicar una versión y activar el schedule elegido. Hasta esa autorización mantener standby. Después comprobar el recorrido público desde un cliente externo, con cuenta y agente propios: QR → cuenta → MCP → catálogo → compra autorizada → tick vendedor → entrega de texto → historial privado y recuperación. No cerrar la demo con la combinación de una cuenta nueva sin compras y una compra antigua de otra cuenta.
