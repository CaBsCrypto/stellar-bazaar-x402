# WebMCP: propiedad verificable al retirar herramientas

Base auditada: `5500652`. Rama local: `mission/full-base`. Fecha: 2026-09-27.

## Problema reproducido

El adaptador conservaba una lista obtenida antes del registro. Con `getTools` asíncrono, esa instantánea podía seguir identificando el manejador anterior después de que otro participante sustituyera una herramienta del mismo nombre. La retirada eliminaba la herramienta nueva.

Reproducción aislada contra el código de `5500652`: registro propio, actualización de la instantánea, reemplazo externo y retirada. Resultado: `replacementPreserved: false`, `nativeDeletions: 1`. Solo se usó un registro en memoria; ninguna API ni proveedor.

## Corrección y límite deliberado

La retirada nativa requiere una lectura **actual y síncrona** que exponga la misma referencia de función `execute` registrada. Una instantánea anterior, una Promise, una lista de metadatos sin función, una respuesta malformada o un error de lectura no autorizan borrar por nombre. En todos los casos se retiran el espejo local y su propiedad local.

Si la API nativa no permite comprobar esa identidad, la herramienta puede permanecer en su registro hasta recargar el documento. El adaptador no promete limpieza nativa completa en ese entorno: un nuevo montaje puede encontrar una colisión y rechazar el registro. No se elimina la herramienta anterior para hacer pasar ese nuevo montaje. Resolver ese límite requiere una API nativa con un identificador de registro o retirada condicionada a propietario, o una comprobación síncrona verificable. Enumerar de forma asíncrona y borrar posteriormente por nombre mantiene una carrera y no es una solución equivalente.

El polyfill y los registros síncronos que conservan la identidad del manejador mantienen su limpieza y remontaje normales. Navegar dentro de la aplicación no desmonta su Provider de layout. No se cambian herramientas HTTP MCP ni pagos.

## Validación reproducible

Runtime: Node 22.18.0. Almacenamiento, navegador y registro simulados en estas pruebas.

- `node scripts/test-webmcp-async-discovery.mjs`: PASS; reemplazo posterior a discovery, Promise array/objeto, metadatos, respuesta ausente y fallo de lectura; cero retiradas nativas en los casos sin identidad actual verificable y espejo local vacío.
- `node scripts/test-webmcp-native-lifecycle.mjs`: PASS; navigator/document, colisión, fallo parcial, remontaje y reemplazo síncrono.
- `node scripts/test-webmcp-lifecycle.mjs`: PASS.
- `node scripts/test-webmcp-conformance.mjs`: PASS.
- `node scripts/test-private-webmcp.mjs`: PASS; no afirma interoperabilidad nativa real.
- `node node_modules/typescript/bin/tsc --noEmit`: PASS.

- `node node_modules/next/dist/bin/next build --webpack`: PASS, Node 22.18.0; advertencia previa metadataBase localhost3000.

La revisión integrada del navegador corresponde al coordinador. Estas pruebas no certifican una API nativa que no exponga propiedad verificable.
