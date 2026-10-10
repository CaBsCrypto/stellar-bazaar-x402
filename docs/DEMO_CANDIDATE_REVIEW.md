# Candidato revisable de la demo — 8 de octubre de 2026

## Fuente y despliegues

- Commit de código final: `094ca7e7a5a68bd6a8998c3ce7cefb6935057bf5`, rama local `codex/bazaar-open-release`. La implementación completa se fijó en `520ea2a835c96bece3317ae96a40a1c4e343d4ea`; el único cambio de aplicación posterior es la negociación GET de MCP y su protección de cuotas.
- Repositorio de origen: `https://github.com/CaBsCrypto/stellar-bazaar-x402.git`. El commit se conservó localmente; no se hizo push ni merge.
- Preview final: `https://stellar-bazaar-x402-ge8feauei-cabscryptocontacto-6028s-projects.vercel.app`, despliegue `dpl_G1JFmtHym322WyZFhgXYJrxo6q5z`, READY. La aceptación inicial de 16 controles se conserva en la preview 520, `dpl_Gt15QXTKBW2Q29CthVXd4CqN3vGj`.
- Conexión del candidato: añadir `/api/mcp` a ese origen. MCP 1.0.0, Streamable HTTP, 34 herramientas.
- Producción permanece en su versión anterior; GET público confirmó MCP 0.5.0 con ocho herramientas. No es todavía la conexión que debe compartirse como demo completa.
- Versiones fijadas: Next 16.3.1, MCP SDK 1.30.0, Stellar SDK 14.4.2, AWS S3 SDK 3.1127.0 y x402 core/Stellar 2.24.0. Node 24.

La lista previa al envío incluyó 314 archivos de aplicación. Excluyó `.vercel`, `.env*`, scripts, ejemplos, documentos, trabajo temporal y `build-provenance`; no se subieron credenciales locales ni simuladores. La simulación de pagos anterior quedó fuera del código de aplicación y su ruta devuelve 404.

## Configuración de la preview

Los prefijos de cuentas, mercado, revisión y R2 usan un ámbito exclusivo de esta validación de preview, con el mismo identificador de familia y distintos prefijos. La preview final reutiliza deliberadamente el ámbito y las dos cuentas sintéticas de la preview 520 para comprobar persistencia tras el despliegue; no reutiliza la preview histórica ni producción. Los registros de revisión contienen únicamente huellas de los prefijos.

Registro abierto, catálogo, presentación de servicios, compras x402 y archivos privados están configurados de manera independiente. La wallet asociada es opcional; cada orden congela su pagador y condiciones. Activar un proveedor sigue requiriendo control del endpoint y revisión humana. No hay proveedor activo en este espacio nuevo hasta completar esa revisión.

Redis es el backend duradero. R2 recibe sus cinco variables, incluido el par sensible existente de Vercel; no hay seed ni firmante servidor. La credencial del guardián se creó como sensible únicamente para Preview, y su hash se pasa a ese despliegue. Se comprobó el tick manual autenticado; Vercel no programa crons de preview. La automatización se muestra deshabilitada con su motivo.

La consola Upstash, revisada el 8 de octubre, mostraba plan Free, 4,6 mil de 500 mil comandos mensuales, 55 KB de 256 MB, 7 MB de 10 GB de ancho de banda y consumo facturado de US$0,00. Es una lectura puntual del consumo, no una garantía de coste futuro ni una prueba local de concurrencia contra Redis real.

La regla R2 `bazaar-market-delivery-seven-days` está activa para `market-deliveries/v1/`, por autorización específica. CORS admite el origen público y tres previews explícitas, incluida la final; sus preflights devolvieron 204 para GET/PUT y el origen ajeno fue rechazado con 403. El bucket continúa privado.

Los límites compartidos de la demo siguen activos: 200 registros/día, 200 por IP/hora, 60 solicitudes/cuenta/minuto, 120 globales y por IP/minuto, y el techo diario de 10.000 solicitudes. Archivos: 50 MB por archivo, 100 MB reservados por cuenta, 5 GB globales, contando pendientes. El contenido visible vence a siete días sin renovación por lecturas.

El medidor opcional de créditos de transporte, su presupuesto y las banderas de aceptación están explícitamente desactivados en esta preview. Sus sobres anteriores no cubren todos los reintentos de admisión e historial autenticado de la demo. Esto no desactiva las cuotas atómicas de cuentas, solicitudes, bytes y reservas. Mantenerlo desactivado en la configuración propuesta de producción; habilitarlo necesitará pruebas específicas de esos sobres.

No se modificaron planes, presupuestos ni pausa automática de Vercel. El plan existente se comprobó como Pro, sin contratar nada.

## Evidencia y límites

- Las 23 suites locales del candidato 520 pasaron, incluyendo identidad, aislamiento, cuotas, concurrencia, permisos de archivo, recuperación, integridad, retención, cron, x402 simulado y cierre de simuladores alojados. El candidato final pasó la nueva prueba de transporte MCP, las regresiones de wallet/MCP y una nueva compilación Next. La suite nueva prueba el cliente SDK oficial, 18 variantes de Accept, cuota de 120 con persistencia en el doble local Redis/Lua y errores 429/503 saneados. El runner completo ahora incluye 24 suites; no se afirma haber repetido las 24 después de este cambio acotado.
- R2 real pasó 17 controles sobre el candidato 520, incluyendo MIME/tamaño/checksum alterados, escritura inmutable, HEAD, GET, Range, acceso sin firma y expiración efectiva de una URL corta. PNG y VTT; no video. Se borraron los dos objetos sintéticos exactos. El adaptador R2 no cambió en el candidato final.
- La clave temporal R2 fue revocada y su archivo local ignorado eliminado después de confirmación. El token de Vercel se conserva.
- La preview 520 pasó 16 comprobaciones alojadas: metadatos, initialize, 34 herramientas, capacidades, instrucciones, runtime, HEAD de R2, guardián manual, dos cuentas, replay del registro, conexión sin wallet, consultas privadas deduplicadas, separación entre actividad declarada y pagos verificados, permisos de los tres métodos de archivos y revocación del agente. La prueba se reanudó conservando las cuentas e identificadores después de corregir el formato del ejemplo; no hubo pagos. No se ejecutó el rechazo de una subida por el proveedor propietario de una orden impagada porque el catálogo aislado no tiene un servicio activo revisado. El cron programado tampoco se ejecuta en preview.
- La preview final pasó seis comprobaciones adicionales mediante 17 solicitudes: GET JSON 200; GET SSE 405 con Allow: POST; cuatro huellas de espacios idénticas; conexión y lecturas de identidad, consultas e historial con dos clientes del SDK oficial; persistencia de la consulta y actividad originales; aislamiento de la cuenta B; archivos originales y credenciales sin modificar. Ambas respuestas GET aplican cuotas y cabeceras privadas. No se crearon cuentas, órdenes ni pagos nuevos. El acceso fue mediante la protección de preview autorizada de Vercel desde el cliente de operador; no demuestra acceso público externo sin esa protección.
- La validación local integrada con Redis real no se ejecutó: no se descargaron sus credenciales. La exportación completa de variables fue rechazada por revisión automática por alcance excesivo. La prueba alojada utiliza las credenciales sensibles del runtime y sí realiza operaciones reales de persistencia.
- No se hizo una transacción real, no se pagó un proveedor y no se comprobó reproducción de video mediante una orden pagada.
- La regla del bucket y el reloj controlado no prueban eliminación física tras siete días reales. El borrado físico de R2 puede demorarse; su regla empieza desde la carga del objeto, mientras el acceso de la aplicación vence desde la orden.
- Falta evidencia emparejada de namespaces de producción, configuración/ejecución real del cron en producción y recorrido público desde el QR.

## Próxima aceptación

La guía universal está en `/AGENT_CONNECTION.md`, y el traspaso técnico en `UNIVERSAL_AGENT_CONNECTION.md`. La página `/demo` enlaza las instrucciones y muestra las capacidades reales. El QR preparado apunta al futuro origen público `/demo`; no demuestra que producción ya contenga el candidato.

Evidencias saneadas: `evidence/demo-local-release-520ea2a.json`, `evidence/demo-mcp-local-delta-094ca7e.json`, `evidence/demo-preview-520ea2a.json`, `evidence/demo-preview-sdk-delta-094ca7e.json`, `evidence/demo-preview-cors-094ca7e.json` y `evidence/market-storage-isolated/storage-backend-validation.json`. Las credenciales y las cuentas sintéticas de recuperación permanecen únicamente en archivos locales ignorados necesarios para las siguientes pruebas.

Para autorizar una compra se necesita un proveedor HTTPS real, su prueba de control, ficha revisada, dirección pública Stellar, modalidad y precio Testnet. Presentar por separado servicio, cantidad e importe; firmar únicamente en el entorno autorizado del comprador. La imagen/video debe existir como resultado real del proveedor externo y completar la subida, confirmación y recuperación autenticadas.

## Sprint de cierre de la hackathon — 9 de octubre

El usuario informa aproximadamente 30 horas hasta el cierre, pero saldrá y tendrá menos disponibilidad personal. Falta confirmar cuántas horas puede estar presente hoy. Las ventanas siguientes son tiempos de trabajo relativos y condicionados a proveedor, firmante y operador disponibles; no son una fecha prometida ni una autorización de compras o publicación.

La coordinación se asigna al agente Scrum Master (`delivery_validation_audit`): mantiene el tablero, comprueba dependencias, exige evidencia para pasar a verificado y escala bloqueos. Root integra el candidato y prepara la publicación. El revisor de catálogo valida publicación y proveedor; el revisor de cuenta/entrega valida compra, visualización y privacidad. El usuario define alcance y autoriza operaciones concretas. El proveedor opera su servicio y su agente; el comprador firma en su propio entorno.

### Servicio existente que podemos reutilizar

La lectura pública del 9 de octubre confirmó `ai-video-scriptwriter` en el catálogo legado de producción y una ficha HTTP 200 en `https://ai-video-scriptwriter.vercel.app/api/service-card`. Es el guionista con salida de teleprompter, probablemente el servicio recordado como «promster». El precio declarado antiguo es 0.02 USDC Testnet; la ficha devuelve `application/json` y no incluye `payment.marketplace`. La lectura no ejecutó el servicio ni verificó un pago, la identidad completa del activo, la generación actual o una entrega de video.

También existe un recibo histórico de `guionista-algorithmic-text-pilot` en `evidence/sprint-marketplace/usdc-sale-receipt.json`, correspondiente a otro candidato y una compra de texto. Primero se investigará si podemos reutilizar su adaptador y worker real. Ninguna de esas evidencias activa automáticamente un proveedor en el espacio aislado actual ni sustituye una nueva revisión. El catálogo legado reportó `partialResults: true` y registro dinámico indisponible; no se presentará esa ficha estática como prueba del flujo nuevo de publicación de proveedores.

El código archivado del proveedor contiene `POST /v1/marketplace-text`, compatible con el adaptador HTTP del worker actual: recibe identificadores de operación/intento e input de guion y devuelve texto y SHA-256. Ese motor es algorítmico y debe describirse así. El worker externo comprueba pago y reclamación por MCP antes de invocarlo; el endpoint por sí solo no prueba autorización de la orden. La disponibilidad actual está pendiente, y las previews históricas del proveedor tenían protección de login para el desafío de control. H0 debe comprobar un origen accesible al worker y prueba pública del endpoint; el HTTP 200 de la ficha legado no resuelve esos dos requisitos.

P0 propone un servicio de guion breve con resultado de texto, contrato exacto actual y precio confirmado por el proveedor. Si el límite es 2.000 caracteres, la ficha debe prometer esa versión breve; no truncar una entrega mayor en silencio. La salida HTML del teleprompter no se ejecutará ni se anunciará como visor disponible del nuevo historial sin su propia implementación y aceptación. Tampoco se invocará el endpoint legado de pago como una segunda compra después de pagar la orden de Bazaar.

### Tablero y ruta crítica del primer bloque

Actualización H0, 9 de octubre: Vercel confirmó un proyecto Express independiente del guionista con `link: null`. GitHub no resolvió el repositorio declarado `CaBsCrypto/ai-video-scriptwriter` con la cuenta `CaBsCrypto`; se pidió identificar la URL original, sin cambiar conexiones. Esa consulta de mantenimiento no es un requisito de publicación y no bloquea H0. Salud y ficha del proveedor devolvieron 200; el desafío público devolvió 404. GET de la ruta de texto devolvió 404, lo que no prueba ausencia de su POST autenticado. No se ejecutó generación ni un pago. H0 permanece pendiente de control fresco y disponibilidad del runtime autorizado.

Aclaración del 10 de octubre: para integrar un proveedor externo Bazaar requiere cuenta, consentimiento del humano, ficha HTTPS compatible, prueba de control del endpoint y revisión manual. No requiere repositorio Git, acceso al código ni credenciales de hosting. La búsqueda del repositorio del guionista propio se separa del camino crítico; podemos continuar con su runtime independiente y preparar una preview del código recuperado si hace falta. La activación, las compras y la publicación conservan sus controles y autorizaciones acordados.

Preparación terminada: el kit vendedor ahora conserva `bazaarOrigin` cifrado y admite `setup --origin`, separando la conexión MCP del origen HTTP del proveedor. Las pruebas locales cubren destinos exactos, redirecciones, credenciales separadas, órdenes impagadas, recuperación e idempotencia. Dos aserciones obsoletas de `test-marketplace.mjs` se actualizaron al body v2 y las herramientas de archivos existentes; no se relajó la aplicación. El código de aplicación `094ca7e` y la preview permanecen sin cambios. Estas pruebas son sintéticas; no cierran compra alojada ni publicación.

Validación nueva de la preview: cinco lecturas devolvieron 200 — metadatos MCP 1.0.0, initialize, tools/list con 34 herramientas, capacidades Testnet y catálogo canónico. El catálogo tiene cero servicios activos en ese espacio. Se usó acceso de operador de Vercel; no es aceptación pública. No se accedió a cuentas privadas ni se crearon cuentas, órdenes, pagos o ejecuciones. La primera invocación del harness falló porque el CLI reenviaba `--no-color` a curl; se corrigió ese argumento y se repitieron las cinco lecturas. Evidencias: `evidence/hackathon-preview-readonly-2026-10-09.json` y `evidence/hackathon-provider-preparation-2026-10-09.json`. El harness fijo de solo lectura es `scripts/validate-hackathon-preview-readonly.mjs`, excluido del despliegue.

Estados: pendiente → en curso → verificado, o bloqueado con dependencia y siguiente acción. Solo una prueba pertinente con candidato y entorno identificados permite marcar verificado. El Scrum Master revisa el tablero al terminar cada ticket y comunica avances o bloqueos cada 15–30 minutos durante la ejecución.

| Ticket | Ventana orientativa | Responsable | Resultado y aceptación |
| --- | --- | --- | --- |
| H0 · Cerrar requisitos | T+0–20 min | Scrum Master + root + usuario/proveedor | Identificar endpoint y worker reutilizable, acceso de control, dirección pública Testnet, activo, precio y disponibilidad del firmante. Si no están disponibles, registrar bloqueo y ajustar plazo; no construir una demo basada en respuestas simuladas. |
| H1 · Preparar candidato y servicio | T+20–60 min | Root + catálogo + proveedor | Validar/adaptar el guionista al contrato de orden actual y ejecución idempotente. Corregir instrucciones de precio/modalidad y cualquier etiqueta incoherente que afecte el alcance elegido. Parametrizar el cliente proveedor para la preview si hace falta. Ejecutar pruebas de los cambios y fijar el commit antes de volver a desplegar preview. |
| H2 · Validar publicación | T+60–90 min | Catálogo + operador humano | Cuenta proveedora nueva → permiso de presentación → ficha por MCP → prueba de control HTTPS → revisión humana → activación autorizada. Catálogo web y MCP muestran el mismo servicio, precio, modalidad y hash. La activación está deshabilitada en la configuración de preview actual y requiere una acción explícita; no saltar la revisión. |
| H3 · Validar compra | T+90–120 min | Cuenta/entrega + proveedor + comprador | Cuenta compradora nueva y credencial propia → MCP → catálogo → orden con pagador/condiciones congelados → HTTP 402. Presentar servicio, cantidad e importe; después de autorización separada, firmar una sola compra Testnet, confirmar pago y ejecutar una sola vez. La wallet previa puede seguir siendo opcional. |
| H4 · Visualizar y recuperar | T+120–150 min | Cuenta/entrega + auditoría | Resultado legible en historial privado, estado del pago y hash de transacción separados de la entrega. Recarga y pérdida de respuesta se recuperan con la misma orden. La cuenta ajena no lee ni modifica contenido; reintentar historial no crea otro cobro. Revocación de la credencial anterior y recuperación humana verificadas. |
| H5 · Decidir publicación | T+150–180 min | Scrum Master + root + usuario | Preparar resumen de pruebas alojadas, configuración efectiva, candidato y riesgos pendientes. Pedir autorización de publicación únicamente con ese resultado concreto. La salida pública requiere después una sola versión aprobada y verificación externa sin acceso de operador. |

Estas ventanas permiten preparar una decisión en unas tres horas si el servicio, worker, firmante y autorizaciones están disponibles. Si H0 descubre que hay que reconstruir el proveedor o su integración, el Scrum Master reestima H1 y mueve la decisión; no mantiene una promesa de tres horas.

### Uso del margen restante de aproximadamente 30 horas

- **Primera prioridad:** completar H0–H4 y reunir las aprobaciones que necesiten presencia del usuario, sin anticipar la de producción a la evidencia. Su salida no constituye autorización. Las claves privadas permanecen en el entorno del firmante.
- **Antes de publicar:** revisar prefijos de producción de cuentas/revisión/órdenes/R2, cuotas, capacidades, admisión y recuperación. Mantener deshabilitadas las funciones no aceptadas en el alcance propuesto. Comprobar guardián/cron autenticado y ejecución en el entorno que realmente los programe.
- **P1 de archivos:** si queda tiempo y existe un proveedor compatible, realizar otra compra autorizada que entregue PNG y MP4 reales: reserva, rechazo para orden impagada, reclamación por el proveedor correcto, subida, confirmación de tamaño/tipo/checksum, visualización/descarga por el comprador, denegación a otra cuenta, vencimiento de URL y recuperación sin repago. Si no pasa, proponer un MVP de texto con nuevas órdenes de archivos deshabilitadas y declarar el alcance reducido; no anunciar video listo.
- **Validación complementaria:** la prueba local con Redis temporal real sigue pendiente de su propia autorización y puede ir en paralelo. No confundir pruebas locales con aceptación alojada ni declarar terminada la integración original de archivos si se entrega únicamente texto.
- **Reserva de cierre:** destinar las últimas dos horas antes de la entrega al recorrido público, evidencia y envío al hackathon. Evitar añadir funciones durante esa reserva. Ajustar la hora concreta cuando se conozca el deadline definitivo.

### Definition of Done y entrega al hackathon

Para el MVP de texto deben pasar publicación de proveedor con revisión manual, compra real Testnet, ejecución única, resultado visible, historial persistente, aislamiento entre cuentas, recuperación sin doble pago y conexión MCP autenticada. Capacidades e instrucciones deben corresponder a la configuración activa. Las pruebas de límites y errores 429/503 deben corresponder al candidato; no provocar agotamiento sobre datos reales.

Después de autorizar producción, comprobar desde un cliente externo y una cuenta nueva el recorrido QR → registro → MCP → catálogo → orden → pago autorizado → entrega → historial. La preview protegida y un cliente de operador no cumplen esa aceptación pública. Si requiere otra transacción, presentar su cantidad e importe previamente; no reutilizar una autorización consumida para pagar de nuevo. Los proveedores nuevos seguirán requiriendo revisión humana, y eso debe estar explicado en la demo.

**Go:** todos los P0 aceptados, alcance transparente y autorización final de configuración/publicación. **No-Go:** falta servicio/control, pago confirmado, entrega verificable, privacidad, recuperación o acceso público. No habilitar la demo de compra con datos simulados para suplir un bloqueo.

Paquete de entrega: URL pública y QR comprobados; `/api/mcp` e instrucciones universales de comprador/proveedor; candidato y configuración; evidencia de transacción Testnet, entrega, privacidad y recuperación; límites y pendientes declarados; guion corto para mostrar el recorrido. La documentación y metadatos no sustituyen evidencia del recorrido alojado. Lectura pública nueva: `evidence/hackathon-service-readonly-2026-10-09.json`.

### Validación complementaria — pruebas locales aisladas de Redis

El 9 de octubre se prepara un mecanismo separado para usar una Redis temporal gratuita, con vencimiento de tres días sin reclamarla ([contrato oficial](https://upstash.com/start-redis), consultado solo mediante GET). Sigue pendiente la autorización para crearla y usarla. No se descargan variables de Vercel ni se copia el token de la base compartida. El perfil local, incluido el UUID que permite recuperar las credenciales de la base temporal, se cifra mediante [DPAPI de Windows](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring) para el usuario actual y queda en `.vercel/redis-validation-secrets.dpapi`, excluido de Git y del despliegue. La creación y sus reintentos deben usar el mismo UUID cifrado previamente; no se reclama la base ni se contratan planes.

El validador recibe el perfil solo por stdin, requiere un endpoint HTTPS temporal diferente del compartido y comprueba la vigencia. Usa dos cuentas y contenido sintéticos, nuevos prefijos congelados y limpieza de las claves exactas que creó. Verifica persistencia tras reiniciar el proceso, aislamiento, cuotas concurrentes y vencimiento de siete días con reloj controlado. El informe conserva resultados permitidos y contadores, sin URL, token ni UUID. Al terminar se elimina la copia cifrada local. Esta prueba no necesita una nueva credencial R2 y no cierra la aceptación integrada de órdenes/archivos ni las compras Testnet.

Si el proceso termina por timeout o no confirma la limpieza de Redis, el resultado es FAIL. La copia local se elimina de todos modos al terminar el intento; el remanente sintético depende entonces del vencimiento de la base temporal de 72 horas. No se declara limpieza inmediata ni aceptación de Redis en ese caso. La base temporal no contiene datos reales ni se conecta a producción.

Las credenciales de servicio permanecen como Secret en Vercel. Para la primera compra alojada todavía se necesita la ficha y prueba de control del proveedor. Las aprobaciones de transacciones y publicación siguen separadas de la base temporal.

La preparación se comprueba con `node scripts/test-temporary-redis-profile.mjs` (65 guardas sintéticas) y `node scripts/test-redis-validation-wrapper.mjs` (27 escenarios Windows, incluido cifrado DPAPI real y permisos NTFS). El segundo usa un hijo local controlado para probar los informes y la eliminación de la copia; no simula un pago ni demuestra conexión con Redis. Los scripts están excluidos del despliegue. No se creó una base, no hubo solicitudes de prueba a Redis ni se guardaron credenciales reales durante esta preparación.

La autorización de producción se solicitará con esas evidencias, configuración final y el commit de código final como candidato. Los commits posteriores que archiven únicamente documentación y scripts excluidos del despliegue no reemplazan esa identificación. Se publicará una sola versión aprobada; no se propondrá la preview protegida como validación pública ni los pagos locales simulados como transacciones reales.
