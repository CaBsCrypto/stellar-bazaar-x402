# Contrato de captura y manifiesto x402

La captura nativa permanece pendiente. CUA acredita el DOM del fixture local; no exporta HAR o NetLog. Los tests del parser usan datos sintéticos y nunca habilitan efectos hospedados.

## Preflight local

Ejecutar `node scripts/serve-x402-capture-fixture.mjs --out docs/evidence/sprint-x402-agent/capture-fixture-ledger.json`. El servidor sólo escucha en 127.0.0.1 y muestra su origen. Su página provoca un redirect, una respuesta parcial interrumpida, SSE finito y un WebSocket con cierre. `snapshot` por stdin conserva el ledger; `stop` lo guarda y cierra. Visitarlo una sola vez, sin reload. El ledger mide lo emitido por el servidor; no es una captura de navegador.

Una persona debe obtener HAR y NetLog en Chrome, empezando antes de navegar y terminando tras quietud de red. Conservarlos privados fuera de Git: pueden contener cookies, Authorization, Magic Links y cuerpos privados. No enviarlos a un servicio de visualización remoto. El parser lee archivos locales y sólo exporta tamaños, hashes, origen/ruta sin query o fragmento e identificadores públicos de correlación. No publica cabeceras, cuerpos ni eventos crudos.

Recorrido manual local:

1. Usar una instancia/perfil dedicado de Chrome y ninguna otra navegación. Abrir personalmente `chrome://net-export`, iniciar registro a un archivo privado local en modo normal, y conservar la versión exacta del navegador. El agente no navega esa página interna ni modifica permisos para llegar a ella.
2. En la pestaña del fixture, abrir DevTools → Network, conservar el log entre redirects y desactivar caché para la prueba. Abrir una vez el origen de loopback; esperar «Terminado: redirect, partial-observed, sse, websocket» y quietud. No recargar. Si faltó un estímulo, conservar el intento fallido; no sustituir sus datos por un test sintético.
3. Detener NetLog y exportar HAR localmente. Conservar originales privados y proporcionar al validador sus rutas locales, no subir archivos crudos a un servicio. La sesión y el ledger vinculan el tramo; el informe público sólo contiene metadata redactada. Si el export omite datos, el resultado sigue FAIL y el hospedado no se habilita.

La sesión JSON, congelada antes de navegar, tiene este contrato:

```json
{"version":1,"segmentId":"UUID nuevo","evidenceKind":"native-browser-capture","scope":"entire-isolated-browser-network-stack-session","browserVersion":"versión exacta constants.clientInfo.version de Chrome","exclusiveBrowserInstance":true,"startedBeforeFirstNavigation":true,"stoppedAfterNetworkQuiet":true,"maxHttpRequests":120,"maxOutboundBytes":16777216,"maxInboundBytes":33554432}
```

Para el fixture, el ledger determina el número exacto de solicitudes esperadas. Para la aceptación hospedada, congelar `expectedRequests:[{"method":"GET","urlHash":"SHA256 de URL exacta"}]` antes de navegar, incluyendo HTML, estáticos, redirects y procesos de plataforma. No reconstruir después una lista para ocultar reintentos. Los límites mostrados son máximos globales, no reservas automáticamente disponibles para cada segmento: usar su asignación restante específica. Para publicar paths legibles, añadir únicamente los paths públicos exactos permitidos a `publicPaths`; el resto se representa por hash. En el tramo hospedado se exige también `binding:{planId,sourceSha,deploymentId,origin}`; el origen se normaliza sin slash final y debe coincidir con el target congelado. La apertura vincula además el hash del informe hospedado al manifiesto.

Validar con `node scripts/validate-x402-browser-capture.mjs --har PRIVATE.har --netlog PRIVATE.json --session SESSION.json --fixture capture-fixture-ledger.json --out PUBLIC.json`. Omitir `--fixture` únicamente para la sesión hospedada. El input está limitado a 128 MiB por archivo. El reporte incorpora hashes de los bytes exactos de cada archivo y hashes estructurales; no publica sus rutas privadas.

HAR aporta solicitudes y tamaños de cuerpos; NetLog aporta jobs, errores, dependencias a sockets y bytes del stack. Se cuentan una vez los bytes SOCKET; los eventos SSL no se suman otra vez. Ese total es una cota conservadora de payload, con overhead TLS incluido. Las retransmisiones que importan aquí son reenvíos/reintentos HTTP; los paquetes Ethernet/TCP del sistema operativo no se afirman medidos. `physicalWireObserved` sigue falso.

Faltan datos si no corresponden todos los jobs y entradas, faltan finales o tamaños, hay caché/service workers sin acreditar, existen reintentos, falta evidencia de frames WebSocket o aparecen transportes QUIC no implementados. Esos casos producen FAIL. Las exportaciones de Chrome pueden omitir datos de streams: que exista un HAR no garantiza PASS. El soporte sólo queda acreditado después de pasar este preflight con archivos nativos reales. No usar los datos de tests como sustituto.

## Manifiesto nuevo

`prepare-x402-acceptance.mjs --draft DRAFT.json --previous-manifest OLD.json --previous-counters OLD-COUNTERS.json --out NEW.json` crea un archivo nuevo con todas las puertas de ejecución, retiro y apertura cerradas. Acepta opcionalmente `--local` y `--capture`. No modifica los originales ni resetea intentos. Conserva hashes exactos y el estado parcial anterior.

El draft incluye `sourceSha`, `storageAllocation` con workspace/market/review/catalog/settlement sumando como máximo 49.164 bytes, `config` con roots y orígenes, `deployments` y `payloads` con ficha, nueva publicación y pedidos exactos. `planId` es nuevo, suministrado o generado. Los límites son 120 API, 400 intercambios Redis, 2400 comandos, 49.164 bytes almacenados, 16/32 MiB y dos nuevos pagos; Friendbot, trustlines y faucet son cero.

La medición local completa exige `status:PASS_NATIVE_X402_LOCAL`, SHA exacto, cero red remota y reintentos, `totals` para todas las claves del límite y `coverage` verdadero de agente HTTP, Redis, facilitador, Horizon, RPC y proveedor. Un transporte no usado tiene un cero **observado por el ledger**, no un valor añadido para reemplazar evidencia ausente. Los tests aislados del comprador no sustituyen este recorrido completo.

En runtime, `BAZAAR_ACCEPTANCE_X402=true` usa medidor v2 y requiere `BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON` con la asignación congelada y `BAZAAR_ACCEPTANCE_SETTLEMENT_KEY=<marketPrefix>:x402-settlements:state`. El CAS de ese documento incluye clave y JSON en la medida. Las asignaciones disjuntas previenen que la suma de namespaces exceda el límite, incluso con escrituras concurrentes. Los defaults y formatos v1 conservan compatibilidad histórica.

Para las dos fichas, congelar `BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON` como `{idHistorico:maxBytesJSON,idNuevo:maxBytesJSON}`. El medidor suma las dos cotas de valor, sus claves, los dos miembros y una sola clave del índice; esa suma debe caber en la partición de catálogo. Cada creación o tombstone respeta su cota individual, pero informa la cota agregada de ambas fichas. Una tercera ID se rechaza. La retirada v2 conserva el JSON original por lectura sin deserialización automática, compara exactamente ese raw por CAS y persiste el nuevo JSON con todos los campos preservados salvo `withdrawn:true`; no reintenta un conflicto. El marcador Lua `x402-catalog-withdraw-cas-v1` permite verificar el payload concreto antes del SET. No usar la cota fija general de 7936 como si cada ficha dispusiera de toda la partición compartida.

La función `assertX402ExecutionGate` verifica hashes, límites, medición local, preflight nativo y puertas explícitas. Preparar el manifiesto no habilita ninguna puerta. Apertura requiere además la captura hospedada completa y ampliación nativa real al 200 %. No se requiere pago humano ni Freighter en esta aceptación por agente.
