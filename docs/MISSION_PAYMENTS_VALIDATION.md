# Consolidación local de pagos — 2026-09-27

Base de trabajo: `145e662` (sobre main auditada `76ba7b1`). Rama aislada `mission/payments`.

## Integración selectiva

- `a0271d6`: expectativa del inventario MCP, procedente de `3f1d887`.
- `8c2f5bd`: piloto USDC/XLM, procedente de `23d448e`. El conflicto del catálogo conserva la eliminación de los chips de filtros rápidos de main; incorpora el selector de activo y reinicia el precio al cambiarlo.
- `f44d0ff`: control compartido, procedente de `5a9269e`.
- `00102c3`: evidencia histórica del almacenamiento, procedente de `e59a4ba`. No se ha vuelto a consultar Redis en esta misión.

Correcciones de revisión: el límite WebMCP ahora declara y compara USDC, sin equipararlo a XLM. La ausencia de autorización explícita bloquea también el Sandbox USDC anterior, no solo el piloto de dos activos. El modo compartido sigue bloqueado en HTTP incluso con la bandera de pagos activada.

## Evidencia nueva: exclusivamente local

Comandos ejecutables desde este checkout (sin cargar `.env.local`):

```text
node scripts/test-xlm-pilot.mjs
node scripts/test-testnet-transfer.mjs
node scripts/test-shared-settlement-local.mjs
node scripts/test-webmcp-conformance.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Todos aprobados. Se usan claves efímeras no fondeadas para construir fixtures; las pruebas integradas reemplazan la creación criptográfica de pagos y el facilitador por dobles. No hay firmas enviadas, transferencias ni lectura de compras históricas.

- Selección preferente USDC, XLM explícitamente permitido/presupuestado, saldo gastable y precisión.
- Contratos, red, destinatario, importe y vinculación alterados rechazados.
- Respuesta y resultado originales conservados; fallo de registro reintenta registro, interrupción del verificador reutiliza respuesta.
- Compra incierta bloqueada; el siguiente intento no firma ni liquida de nuevo.
- Tres procesos contra un servicio de almacenamiento simulado local comparten un único intento; otro proceso recupera el resultado.
- Pérdida de respuesta al crear marcador, liquidar o finalizar, almacenamiento caído y registros dañados mantienen bloqueo.
- Ninguna llamada al facilitador si pagos están deshabilitados o si se usa almacenamiento compartido desplegable.

El doble modela la atomicidad de `eval`; **no valida la ejecución de Lua ni la durabilidad de Redis**. Las pruebas `test-shared-settlement.mjs` y `test-shared-http.mjs` sí escriben Redis real y no se ejecutaron. Su evidencia histórica está separada en los documentos existentes.

## Pendientes y límites

- La integración final con aprovisionamiento corregido de identidad y biblioteca se valida por el coordinador, tras integrar ambos bloques.
- La compra histórica USDC/XLM no se reconsultó ni se modificó aquí. No se anuncia validación nueva de Testnet.
- Persistencia, restauración y entorno Preview siguen siendo requisitos operativos independientes. No habilitar pagos por pasar estas pruebas.
- El piloto usa archivos privados locales para el diario del comprador. No se ha migrado ese diario ni se han trasladado claves a Redis.
- USDT0 no está incluido en estos commits; no hay conversión, puentes, escrow ni fee split nuevos.
