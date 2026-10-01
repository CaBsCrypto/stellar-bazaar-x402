# MCP y producto: entrega del sprint

Base: `61bcb685f6e359e8f756c5226399d3a6bc8202fa`. Fecha: 2026-10-01.
Runtime de verificación: Node 22.18.0; dependencias existentes del checkout.
El coordinador debe fijar el SHA integrado final y conservar la revisión de ese SHA.

## Paquete y correcciones

`docs/OPEN_BAZAAR_SYNTHETIC_HANDOFF.md` entrega prompt, requisitos, acceso al contrato,
comandos y dos scripts copiables que viven en directorios privados externos al
checkout. Conservan intención humana, respuesta, operación y actividad antes del
primer envío. El agente recibe únicamente `agent.json`; el dueño conserva el acceso
humano y la raíz con secreto de recuperación. No hay modelo, pago o proveedor.

El helper de workspace existente ya congela `creationId`, tres secretos independientes,
hashes y digest antes del alta, `attemptId` antes de reclamar y `messageId`/texto antes
de responder. Conserva el recibo inicial y snapshots posteriores. No se añadieron
métodos, permisos ni capacidades al helper.

La revisión independiente encontró que la guía original indicaba responder texto en
el paso 2 y cambiar esa respuesta al vincular una entrega en el paso 3. El helper
rechazaba correctamente el cambio. La guía ahora distingue finales excluyentes:
respuesta de solo texto, o entrega con respuesta definitiva conservada antes de
registrar y enviada una sola vez tras el registro confirmado.

La misma revisión detectó la reconexión por defecto del SDK después de EOF SSE.
`examples/private-mcp-client.mjs` fija `maxRetries:0` y conserva el cierre del cliente
al terminar cada comando. Las dos guías explican el requisito para clientes externos.

El navegador del coordinador reprodujo dos desbordes con ampliación medida al 200 %:
navegación superior en 1366×768 y controles de filtro en 390×844. Los cambios CSS
permiten envolver navegación y restringen grid/controles al ancho de su contenedor.
Se leyeron las guías locales Next de Server/Client Components y `use client` antes
de modificar estilos. No se cambió lógica de sesión ni fuente TSX.

## Verificación local

Ejecutar desde el checkout, con Node 22.18.0:

```sh
node scripts/test-private-mcp-no-reconnect.mjs
node scripts/test-open-bazaar-synthetic-handoff.mjs --checkout CHECKOUT_CONSTRUIDO
node scripts/test-private-workspace-chat-ui.mjs
node scripts/test-private-workspace-chat-lifecycle.mjs
node scripts/test-private-purchase-manual-refresh.mjs
node scripts/test-buyer-instructions.mjs
node scripts/test-seller-instructions.mjs
node scripts/test-agent-entry-copy.mjs
node scripts/test-buyer-mcp.mjs
```

Todos esos gates pasaron. El handoff ejecutó los bloques literales de la documentación
y el helper real contra Next construido de la base con file aislado. Un lock propio
sintético produjo un fallo de registro antes de escribir; su retiro explícito permitió
reintentar únicamente el archivo conservado. La respuesta y los archivos permanecieron
idénticos, y tras reinicio hubo un mensaje humano, una respuesta y una operación.
El test no requiere que su propio checkout esté construido: `--checkout` identifica
el servidor local ya construido; siempre usa la guía/helper del checkout del test.

Conteo efectivo observado: 23 comandos, 78 HTTP de comandos, seis intentos de arranque
y una verificación HTTP adicional; 85 solicitudes/intentos HTTP en total. Cero
solicitudes externas, modelos alojados o pagos. No se hicieron reintentos de transporte.
Las preparaciones y generación de fixture registraron cero solicitudes.

El gate de transporte mantuvo un cliente real SDK abierto durante 1,7 segundos:
un GET SSE con EOF, un POST con respuesta perdida y cero reconexiones/reenvíos
automáticos. Esto es un doble HTTP local; no representa un fallo inducido en Redis.

Chat/ciclo/biblioteca se verificaron también con hooks y HTTP dobles ejecutados.
No se presentan esos gates como navegador real. La evidencia redactada, hashes y
conteos están en [handoff-local.json](../evidence/sprint-product/handoff-local.json).
Los paquetes privados y registros completos se conservaron en el directorio temporal
identificado allí; no se copian al repositorio ni se adjuntan a capturas.

El intento `test-provider-mcp.mjs` desde este checkout sin `.next` no arrancó el
servidor y no cuenta como aprobado. Debe ejecutarse en el checkout integrado construido;
es un límite del entorno de esa ejecución, no una aceptación Redis ni una regresión
confirmada del producto.

## Gates que conserva el coordinador

La revisión independiente del código/guías, compilación/tipos integrados y repetición
del navegador con los CSS corregidos deben asociarse al candidato final. Revisar
390×844, 1366×768, texto realmente ampliado al 200 %, rectángulos visibles, teclado,
bloqueo, reentrada, borrador vacío y respuesta tardía. Ocultar el campo de acceso y
evitar fragmentos secretos en las capturas. `overflow-x:hidden` global no demuestra
ausencia de desbordes: medir los rectángulos y el ancho de la captura.

Redis real sigue siendo un gate separado con instancia, claves, prefijo, presupuesto
y autorización explícitos. Este trabajo no escribió Redis/S3 externos ni `.env`, no
tocó claves históricas, y no produjo commit, push, merge o despliegue.

## Corte integrado y revisión visual final del coordinador

El coordinador integró las fuentes revisadas en
`6c60391d271a57b04ec8621470237c9ca2f522e2`; build Next webpack
`WxPu0FGeFg7y3k_ufOvHy`, Node 22.18.0. Build y tipos pasaron.
El handoff volvió a pasar contra ese build: 23 comandos, 78 HTTP de comandos,
seis readiness y una verificación, 85 intentos totales. El gate proveedor/MCP con
Next construido también pasó: recepción cerrada, solicitudes pendientes privadas
y fuera del catálogo, aislamiento y recuperación tras reinicio. El fallo inicial
por falta de build no se usa como evidencia de aprobación.

Producto revisó el reporte y las ocho capturas finales del mismo SHA/BUILD_ID:
390×844 y 1366×768 al 100/200 %, ratio calculado x2, navbar/filtros contenidos y
contenido legible. Sin hallazgos bloqueantes dentro de ese alcance; el acceso
está enmascarado. El reporte registra bloqueo por teclado, borrador retirado,
reentrada, respuesta tardía entregada/ignorada y mismos JSON tras reinicio.

La guía y el probe se corrigieron para ubicar exactamente la etiqueta: la vista
principal muestra **Sin pago**; **Simulación** aparece al abrir la vista técnica.
No se aprobó una etiqueta prominente en el resultado principal. Tampoco se afirma
prueba de dispositivo físico, zoom nativo, Redis real, WCAG completo o publicación.
Esta sección conserva la aprobación comunicada por el especialista de producto;
la reproducción independiente del expediente se registra por separado.
