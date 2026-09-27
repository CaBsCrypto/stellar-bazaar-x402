# Comprador: entrega a un agente con terminal y MCP

## Alcance y requisitos

Necesitas una copia de este repositorio, Node.js 22.18.0 (runtime comprobado, también usado como versión mayor en CI) y sus dependencias (`npm ci` si no existe `node_modules`). Ejecuta los comandos desde la raíz del repositorio. No necesitas wallet, saldo, archivos .env, tokens ni servicios desplegados para esta aceptación. No ejecutes faucets ni scripts de pagos reales. Los datos de compra son sintéticos; no prueban liquidación Stellar ni disponibilidad de proveedores.

El prompt compartido por landing y hub está en `lib/testnet-funding.ts`: enlaza `public/llms.txt` y el MCP público. Para esta prueba sustituye el endpoint por el servidor local indicado abajo. Un cliente MCP permite descubrir e inspeccionar; la terminal ejecuta la simulación por separado. El servidor MCP HTTP no tiene herramientas de compra ni firma. WebMCP pertenece al navegador y tiene otra superficie.

## Prompt local listo para copiar

> Ayúdame a elegir y probar un servicio de Bazaar en simulación local. Lee public/llms.txt y docs/BUYER_HANDOFF.md en este repositorio. Conecta el cliente MCP a http://127.0.0.1:3214/api/mcp, enumera las ocho herramientas e inspecciona la ficha sintética. El MCP es de solo lectura. Usa exclusivamente scripts/buyer-acceptance.mjs para preparar, comprar y recuperar en una carpeta temporal nueva; autorizo solo simulación XLM con presupuesto 0.01, cero pagos reales. Verifica entrega e historial y demuestra que recuperar no agrega firmas ni liquidaciones. Informa límites o bloqueos; no uses faucets, red de pagos ni credenciales reales.

## 1. Descubrir por MCP HTTP real

En terminal A:

```sh
node scripts/serve-buyer-mcp-review.mjs
```

En terminal B:

```sh
node scripts/buyer-mcp-review.mjs --url http://127.0.0.1:3214/api/mcp
```

El cliente usa el SDK MCP instalado, inicializa la conexión, enumera herramientas y consulta fichas sintéticas por loopback. No supone que un GET informativo sea una conexión MCP. Las ocho herramientas esperadas son get_bazaar_capabilities, list_services, search_services, get_service, list_workflow_bundles, get_workflow_bundle, validate_service_card y get_operation_history. Esta última requiere autenticación privada en producción; conectar no concede acceso al historial. No hay execute_service.

Prueba autocontenida alternativa (inicia y cierra su propio servidor):

```sh
node scripts/test-buyer-mcp.mjs
```

Finaliza terminal A con Ctrl+C cuando acabes. Para inspeccionar un servicio del catálogo real, usa `get_service` con su ID; `/resources/{id}` es una página humana. No existe una API REST de detalle por ID. No presentes las fichas sintéticas de revisión como catálogo comercial.

## 2. Completar una compra simulada desde cero

Los siguientes bloques usan PowerShell en Windows. Usa una carpeta temporal nueva, fuera del checkout, por escenario. El ejecutor prepara su estado sintético; no lee credenciales reales.

El identificador `--operation` debe tener entre 8 y 128 caracteres: letras, números, guion o guion bajo. Consérvalo durante toda la recuperación de esa compra.

```powershell
$buyerDemo = Join-Path $env:TEMP ("bazaar-buyer-" + [guid]::NewGuid())
node scripts/buyer-acceptance.mjs prepare --dir "$buyerDemo"
node scripts/buyer-acceptance.mjs buy --dir "$buyerDemo" --operation compra-001 --asset XLM --budget 0.01
node scripts/buyer-acceptance.mjs recover --dir "$buyerDemo" --operation compra-001 --asset XLM --budget 0.01
```

Revisa el JSON, la entrega y el historial. Debe identificar `simulation: true` y `realPayments: 0`. La recuperación de la misma operación debe conservar los contadores de firmas y liquidaciones; no es una compra nueva. Si hay un bloqueo, informa su causa y no declares éxito.

Escenario de pago incierto, en otra carpeta nueva:

```powershell
$buyerUncertain = Join-Path $env:TEMP ("bazaar-uncertain-" + [guid]::NewGuid())
node scripts/buyer-acceptance.mjs prepare --dir "$buyerUncertain"
node scripts/buyer-acceptance.mjs buy --dir "$buyerUncertain" --operation compra-002 --asset XLM --budget 0.01 --fault uncertain
node scripts/buyer-acceptance.mjs recover --dir "$buyerUncertain" --operation compra-002 --asset XLM --budget 0.01
```

En este escenario se espera un fallo controlado: `recover` devuelve `PAYMENT_PENDING` y conserva los contadores en una firma y una liquidación (1/1). La recuperación no termina la operación: queda bloqueada hasta contar con evidencia independiente. Este simulador no ofrece un comando de conciliación (`reconcile`), por lo que repetir `recover` seguirá mostrando ese bloqueo. Conserva el mismo ID y estado; no borres la carpeta ni repitas `buy` con otro ID para resolver incertidumbre. Los escenarios `--fault history`, `--fault tamper` y `--fault signer` permiten comprobar fallos; usa una carpeta nueva para cada uno. `--no-history` desactiva historial y debe conservarse entre buy y recover: no se debe prometer un enlace privado.

## 3. Informe que debe entregar el agente

Para comprobar saldo ausente sin consultar una wallet real, usa `buy` en otra carpeta preparada con `--fault funds`: debe rechazar la compra con `NO_AUTHORIZED_FUNDED_OPTION`, cero firmas y cero liquidaciones. `--fault signer` representa un firmante ausente. Ambos son dobles; no prueban conexión a una wallet externa. No ejecutes faucets para resolverlos.

Incluye comando ejecutado, servicio/activo/presupuesto elegido, resultado, evidencia de entrega y contadores antes/después de recuperar. Identifica si el historial quedó registrado, falló o estaba desactivado. Indica siempre que es simulación local y que se realizaron cero pagos reales. No copies tokens, claves ni archivos de estado completos.

## Fuera de esta prueba

Una compra real requiere autorización de presupuesto y activo, ejecutor compatible, firmante local, saldo y verificación independiente del recibo y entrega. Si falta alguno, describe el bloqueo. El MCP HTTP no aporta estas capacidades. `lib/bazaar-agent-client.ts` y `lib/provider-kit.ts` son código interno: no hay un paquete Bazaar que instalar. El ejemplo SDK de la interfaz usa REST, requiere la configuración de alias del repositorio y no crea historial automáticamente. La autenticación y el reporte de historial se integran aparte según `public/HISTORY_CONNECTION.md`.
