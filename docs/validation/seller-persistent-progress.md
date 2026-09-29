# Solicitud persistente: evidencia de aceptación local

Fecha: 2026-09-29. Base: `mission/identity-pilot`, `28a3c83b3366b1951b42c17b4d685798ddad5ce3`, con cambios locales sin commit. Runtime principal: Node 24.14.0, Windows. Recepción pública deshabilitada; este documento acredita únicamente el bloque local sintético.

## Comprobaciones ejecutadas

Todos los comandos se ejecutaron desde este checkout, con datos sintéticos:

| Comando | Resultado y alcance |
| --- | --- |
| `node scripts/test-seller-end-to-end.mjs` | Aprobado: handlers HTTP y MCP reales con almacenamiento y DNS dobles, concurrencia entre procesos, tres reinicios, recibo autenticado, revisión y activación separadas, cola privada excluida del descubrimiento. Cero pagos y escrituras externas. |
| `node scripts/test-provider-review-store.mjs` | Aprobado: ocho procesos, persistencia, conflicto de lock, aborto, corrupción y capacidad; rechazo de directorio relativo. El número de procesos admitidos varía según el lock; los rechazados no reintentan automáticamente. |
| `node scripts/test-provider-review-operator.mjs` | Aprobado: prueba DNS/HTTPS simulada, revisión explícita, activación concurrente y recuperación sin nueva incorporación. Cero llamadas externas. |
| `node scripts/test-provider-self-listing.mjs` | Aprobado: dominios inválidos, caducidad y transiciones. |
| `node scripts/test-provider-submission-http.mjs` | Aprobado: origen local, bloqueo en despliegue, límite de bytes UTF-8, cancelación de stream excesivo y JSON inválido. Sin red ni almacenamiento. |
| `node scripts/test-provider-review-controls.mjs` | Aprobado con dobles de componente: acceso guardado antes del envío, intención congelada, recuperación, selección manual y corrección explícita después de rechazo/caducidad. |
| `node node_modules/typescript/bin/tsc --noEmit` | Aprobado después de la corrección de formulario y exigencia de ruta absoluta. |
| `node node_modules/next/dist/bin/next build --webpack` | Aprobado nuevamente después de las correcciones de formulario, ruta absoluta y ejemplo público. Advertencia de `metadataBase` sin configurar. |

## Revisión independiente y correcciones

El revisor `seller_final_review` reprodujo seis suites y detectó que no existía una acción para corregir una solicitud rechazada sin perder el formulario. Se añadió una acción explícita, limitada al recibo actual rechazado/caducado y condicionada a conservar el acceso y comprobante anteriores. No reinicia solicitudes pendientes o inciertas.

También se rechazaron rutas relativas para el almacén. La selección de un directorio privado fuera del repositorio y sus permisos efectivos siguen siendo responsabilidad operativa; una ruta absoluta no demuestra aislamiento ni permisos. El proceso debe escuchar únicamente en loopback: comprobar hostname y Origin no sustituye el enlace de red del servidor.

## Agente independiente y navegador

- Agente independiente: inicialmente bloqueado por ausencia de una ServiceCard mínima completa. Se añadió un ejemplo validado contra el esquema real mediante `test-seller-instructions.mjs`. En la repetición, `seller_cold_start` construyó la ficha sin leer implementación, aprobó 11 reglas, recibió HTTP 202 y recuperó HTTP 200 desde otro proceso usando acceso privado fuera del repositorio. El destino fue una entrada explícita del proveedor, no una inferencia.
- Tras activación, confirmó `activated`, `publiclyActive:true`, prueba verificada y revisión aprobada. Comparó ficha exacta en MCP list/search/get y HTTP discovery: 200, `partialResults:false`, registro disponible. El harness identifica disponibilidad como sintética y pagos no activos. No prueba una API real.
- Se corrigió una segunda laguna documental: faltaba indicar la ruta HTTP de discovery. La guía ahora documenta `GET /api/discovery/resources` y la comparación por identificador.
- Navegador interno, Next real en `127.0.0.1:3253`, adaptador Redis REST **local de solo lectura** sobre el registro sintético. Se comprobó el enlace del catálogo al detalle de `independent-report-6637c4a8`, descripción sintética, precio 0.001 USDC, red, destinatario y ruta `/v1/report`.
- Viewports 390×844 y 1366×768: anchos de documento 375 y 1351 respectivamente (barra de desplazamiento); `scrollWidth` igual a `clientWidth`. Ficha y formulario sin desbordamiento horizontal.
- Borrador vacío: errores y foco en nombre. Idea sin API: copia conserva texto humano y muestra «Borrador · no publicado». Copia de manifest correcta, selección manual completa. URL HTTP no permitida deshabilita preparación; recuperación desconocida muestra acceso rechazado. Preparar no envía, y enviar queda bloqueado hasta confirmar que se guardó el acceso.
- `/hub` y diálogo de portada copian exactamente el mismo prompt de Publicar. Alternativa «Seleccionar texto» selecciona todo. Escape cierra el diálogo y devuelve foco a «Conectar mi agente».
- `test-seller-end-to-end.mjs` y `test-seller-instructions.mjs` repetidos con Node **22.18.0**, aprobados. También aprobados `test-seller-form.mjs`, `test-seller-mcp.mjs`, `test-provider-review-packet.mjs` y `git diff --check` (solo avisos de normalización CRLF).

No hubo push, merge, despliegue, pagos ni escrituras en Redis. El almacén de archivos es un piloto local, no una solución publicada para múltiples instancias ni una garantía frente a pérdida de disco.

Solicitud sintética independiente: `71d31a49-85c2-4986-a46e-e7276df45b29`. El operador ejecutó verificación DNS con doble, revisión, staging y activación mediante el harness aislado. Cada paso respondió HTTP 200. Esto no demuestra control de un dominio real ni publicación externa.

## Matriz de cierre del bloque local

| Requisito | Evidencia |
| --- | --- |
| Idea frente a API, sin promesas ficticias | Guía, prompt, borrador visual y agente independiente; no llamadas a la API sintética |
| Ficha inválida no avanza | MCP válido/inválido, rechazo HTTP y botón deshabilitado en navegador |
| Concurrencia e identidad estable | Dos procesos en E2E; mismo ID conserva solicitud; condiciones alteradas producen conflicto |
| Reinicio y recuperación | Tres reinicios E2E más proceso independiente del agente |
| Incertidumbre y corrupción | Store/operador: marcador conservado, fallo cerrado, recuperación sin reingestión |
| Control y revisión separados | DNS/HTTPS con dobles, expiración, rechazo de aprobación prematura y de acceso del proveedor al operador |
| Rechazo corregible con evidencia anterior | E2E conserva solicitud rechazada; controles exigen acción explícita y nuevo acceso |
| Activación únicamente de ficha aprobada | Marcador antes de `createService`; cola pendiente excluida; coincidencia de hash/contenido |
| Catálogo, detalle, HTTP y MCP | Agente independiente + Next real en navegador sobre adaptador sintético |
| Copia, selección, errores y responsive | Navegador real y regresiones de componentes; fallo de clipboard inducido solo mediante dobles |
| Tipos y build | TypeScript y Webpack aprobados; no se atribuye aprobación a Turbopack |

## Reproducción de la revisión visual

Con un directorio sintético creado por el harness y que contenga `synthetic-registry.json`, ejecutar:

```text
node scripts/serve-seller-review-ui.mjs --directory=ABSOLUTE_SYNTHETIC_DIRECTORY --port=3253
```

El launcher se niega a arrancar si existen archivos `.env` de producción en el checkout, usa un entorno mínimo sin credenciales heredadas, enlaza Next y el doble a loopback y rechaza escrituras del protocolo Redis. No representa Redis externo. No usar directorios históricos. Los procesos se detienen con Ctrl+C; se conservan los pocos datos sintéticos para revisión.

## Puerta pública posterior

Decisión del Scrum Master: **bloque local aprobado**. Revisión final independiente de `seller_final_review`: sin bloqueos para aceptación sintética local; ejemplo comprobado contra las 11 reglas, ruta HTTP coherente, launcher loopback y regresiones aprobadas. El launcher no es un sandbox de red: la ausencia de llamadas externas se limita al recorrido ejercitado, no a cualquier ruta posible de la aplicación.

Antes de publicar: elegir almacenamiento compartido y comprobar sus garantías, autorización operativa, límites de abuso y canal de revisión; revisar diff y compatibilidad; autorizar publicación por separado y repetir el recorrido externo. Persistencia de archivos local no resuelve esas condiciones. Los identificadores de la antigua cola en memoria no se migran ni reasignan. No se ha validado ninguna compra, API del proveedor real o integración multichain en este bloque.
