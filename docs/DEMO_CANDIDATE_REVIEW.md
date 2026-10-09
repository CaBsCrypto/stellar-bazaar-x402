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

### Paso inmediato — pruebas locales aisladas de Redis

El 9 de octubre se prepara un mecanismo separado para usar una Redis temporal gratuita, con vencimiento de tres días sin reclamarla ([contrato oficial](https://upstash.com/start-redis), consultado solo mediante GET). Sigue pendiente la autorización para crearla y usarla. No se descargan variables de Vercel ni se copia el token de la base compartida. El perfil local, incluido el UUID que permite recuperar las credenciales de la base temporal, se cifra mediante [DPAPI de Windows](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring) para el usuario actual y queda en `.vercel/redis-validation-secrets.dpapi`, excluido de Git y del despliegue. La creación y sus reintentos deben usar el mismo UUID cifrado previamente; no se reclama la base ni se contratan planes.

El validador recibe el perfil solo por stdin, requiere un endpoint HTTPS temporal diferente del compartido y comprueba la vigencia. Usa dos cuentas y contenido sintéticos, nuevos prefijos congelados y limpieza de las claves exactas que creó. Verifica persistencia tras reiniciar el proceso, aislamiento, cuotas concurrentes y vencimiento de siete días con reloj controlado. El informe conserva resultados permitidos y contadores, sin URL, token ni UUID. Al terminar se elimina la copia cifrada local. Esta prueba no necesita una nueva credencial R2 y no cierra la aceptación integrada de órdenes/archivos ni las compras Testnet.

Si el proceso termina por timeout o no confirma la limpieza de Redis, el resultado es FAIL. La copia local se elimina de todos modos al terminar el intento; el remanente sintético depende entonces del vencimiento de la base temporal de 72 horas. No se declara limpieza inmediata ni aceptación de Redis en ese caso. La base temporal no contiene datos reales ni se conecta a producción.

Las credenciales de servicio permanecen como Secret en Vercel. Para la primera compra alojada todavía se necesita la ficha y prueba de control del proveedor. Las aprobaciones de transacciones y publicación siguen separadas de la base temporal.

La preparación se comprueba con `node scripts/test-temporary-redis-profile.mjs` (65 guardas sintéticas) y `node scripts/test-redis-validation-wrapper.mjs` (27 escenarios Windows, incluido cifrado DPAPI real y permisos NTFS). El segundo usa un hijo local controlado para probar los informes y la eliminación de la copia; no simula un pago ni demuestra conexión con Redis. Los scripts están excluidos del despliegue. No se creó una base, no hubo solicitudes de prueba a Redis ni se guardaron credenciales reales durante esta preparación.

La autorización de producción se solicitará con esas evidencias, configuración final y el commit de código final como candidato. Los commits posteriores que archiven únicamente documentación y scripts excluidos del despliegue no reemplazan esa identificación. Se publicará una sola versión aprobada; no se propondrá la preview protegida como validación pública ni los pagos locales simulados como transacciones reales.
