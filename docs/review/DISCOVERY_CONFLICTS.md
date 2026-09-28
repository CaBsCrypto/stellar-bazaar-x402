# Conflictos e integridad del registro público

Revisión local sobre `09b5055`, Node 22.18.0. Sin Redis externo ni publicaciones.

## Corrección

- Un ID estático no puede registrarse mediante ingest; devuelve `CARD_EXISTS` antes de escribir. La creación interna también lo rechaza.
- Un registro histórico con ID estático se conserva en almacenamiento, pero no se incluye en el conjunto público dinámico. El estático mantiene la precedencia común en REST, catálogo, ficha y WebMCP.
- IDs repetidos, entradas ausentes, registros malformados o discordancia entre ID del índice y ficha marcan `available: false`; las superficies existentes lo traducen a catálogo parcial. No se añaden campos ni endpoints públicos.
- Las entradas válidas restantes siguen disponibles. Una ficha válida de ese subconjunto muestra aviso de registro parcial; un ID desconocido no se presenta como inexistente si la lectura está incompleta.

La condición parcial agrupa indisponibilidad y conflictos de integridad para conservar el formato actual. Requiere inspección administrativa posterior; no borra ni corrige automáticamente registros históricos.

## Pruebas

Todos PASS con Node 22.18.0:

- `node scripts/test-discovery-conflicts.mjs`: Redis doble, rechazo antes de escritura, colisión histórica preservada, precedencia REST/browser/WebMCP, null, malformado, ID discordante e índice duplicado.
- `node scripts/test-webmcp-public-discovery.mjs`.
- `node scripts/test-public-resource-render.mjs`: componente de ficha real, precedencia estática y ficha válida con aviso parcial.
- `node scripts/test-buyer-instructions.mjs`.
- `node scripts/test-buyer-mcp.mjs`: cliente SDK real contra servidor loopback y almacén sintético autenticado.
- `node scripts/test-buyer-acceptance.mjs`: simulación local, incluida falta de fondos; no firma ni liquidación real.
- `node node_modules/typescript/bin/tsc --noEmit`.

Compilación y revisión de navegador finales quedan bajo la integración del coordinador.
