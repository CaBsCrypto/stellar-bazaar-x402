# Traspaso universal para agentes de compradores y proveedores

Entrada pública: `public/AGENT_CONNECTION.md`, servida como `/AGENT_CONNECTION.md`. Cualquier desarrollador puede conectar su propio agente MCP; no se requiere una integración exclusiva con un desarrollador invitado. El agente puede comprar y vender desde su cuenta. Esta versión admite un agente por cuenta y una wallet asociada activa opcional; la autorización de cada pago corresponde al pagador congelado en su orden. La demo permanece abierta, sin membresía y únicamente en Stellar Testnet.

## Elegir el despliegue y comprobar el contrato

Usa el origen HTTPS exacto que el operador haya identificado, con `/api/mcp`. El endpoint previsto de producción es `https://bazaar.browns.studio/api/mcp`; una preview usa su propio origen. Comienza con GET de metadatos públicos, `initialize`, `tools/list` y `get_bazaar_capabilities`. El listado de herramientas describe contrato; sus capacidades indican disponibilidad y razones, y no prueban por sí solas conectividad o aceptación real.

La consulta pública de producción del 8 de octubre de 2026 devolvió MCP **0.5.0 y ocho herramientas**. El candidato local declara **1.0.0 y 34 herramientas** en `lib/mcp-tool-contract.ts`. La evidencia saneada está en `docs/evidence/demo-production-mcp-metadata-2026-10-08.json`; solo acredita los metadatos de esa URL a esa hora. No demuestra que este candidato esté publicado, ni registro, Redis/R2, identidad, archivos o compras en producción. Repite la comprobación tras un despliegue autorizado.

## Cliente MCP con el SDK del checkout

Instala las dependencias del candidato con `npm ci` y utiliza Node 24 según `package.json`. El SDK MCP está fijado en el lockfile. Este patrón admite cualquier agente capaz de mantener una conexión Streamable HTTP y leer su credencial desde un archivo privado o broker propio:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// origin y agentAccess provienen de la configuración privada del participante.
export async function inspectBazaar({ origin, agentAccess }) {
  const base = new URL(origin);
  if (base.origin !== origin || base.protocol !== 'https:' || base.username || base.password) {
    throw Error('Exact HTTPS origin required');
  }
  const endpoint = new URL('/api/mcp', origin);
  const client = new Client({ name: 'my-external-agent', version: '1' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
    requestInit: { headers: { Authorization: `Bearer ${agentAccess}` } },
    fetch: async (url, init) => {
      const target = new URL(url instanceof Request ? url.url : String(url));
      if (target.href !== endpoint.href) throw Error('MCP endpoint denied');
      return fetch(url, { ...init, redirect: 'error' });
    },
  });
  try {
    await client.connect(transport); // initialize y negociación del protocolo.
    const tools = await client.listTools();
    const capabilities = await client.callTool({ name: 'get_bazaar_capabilities', arguments: {} });
    const identity = await client.callTool({ name: 'get_bazaar_identity', arguments: {} });
    return { tools, capabilities, identity };
  } finally {
    await client.close().catch(() => {});
  }
}
```

El helper existente `examples/private-mcp-client.mjs` aplica la misma conexión con origen validado. Configuraciones de clientes que acepten `mcpServers` pueden usar `{type:"http",url:"ORIGEN/api/mcp"}` y una cabecera `Authorization` privada. No existe un formato de archivo universal para todos los clientes; conserva el transporte y los permisos, adaptando únicamente su configuración.

Sin token, usa una conexión de descubrimiento y omite la cabecera. Con cuenta, usa solo el acceso propio de agente. El acceso humano y el de recuperación pertenecen al dueño; no se entregan al agente. Los enlaces humanos con `#token=…` son fragmentos consumidos y retirados en el navegador antes de las solicitudes por cabecera; nunca transformarlos en parámetros de URL del servidor. Proteger archivos, trazas y backups sigue siendo responsabilidad del participante.

## Comandos existentes para cuenta y diagnóstico

Ejecuta desde la raíz del candidato. Sustituye `ORIGEN` y rutas por el entorno aceptado y directorios privados nuevos fuera del checkout. Estos comandos no se ejecutaron contra producción como parte de la inspección de metadatos:

```sh
node examples/agent-workspace-mcp.mjs prepare RUTA_PRIVADA_NUEVA ORIGEN
node examples/agent-workspace-mcp.mjs create RUTA_PRIVADA_NUEVA
node examples/agent-workspace-mcp.mjs tasks RUTA_PRIVADA_NUEVA
node examples/agent-workspace-mcp.mjs recover RUTA_PRIVADA_NUEVA
```

`prepare` conserva secretos e intención antes de la solicitud; `create` envía o recupera ese mismo intento. Da al agente únicamente `agent.json`; el dueño conserva `workspace-root.json` y `human-links.txt` en el directorio protegido. Este helper usa archivos privados con permisos restringidos; no es un almacén cifrado. Los kits de compra y proveedor siguientes sí usan el almacén portátil cifrado. `recover` en este helper lee actividad declarada; los pagos se inspeccionan por `get_market_order`, `list_market_orders` o el CLI comprador.

Herramientas iniciales: `get_bazaar_identity`, `get_bazaar_skills`, `list_market_services`. Las skills versionadas del proveedor son contenido revisado y no autoridad para ejecutar comandos, modificar presupuesto o revelar credenciales. Las herramientas de wallet son opcionales, firman una prueba de asociación fuera de Bazaar y no constituyen autorización de pago.

## Comprador: MCP y pago HTTP/x402

El agente descubre y crea la orden mediante MCP. El precio de su ficha activa puede ser cualquier importe positivo con hasta siete decimales dentro de int64 atómico de Stellar. La orden congela ficha, hash, entrada, pagador, destinatario, USDC oficial Testnet y modalidad de entrega. Su endpoint HTTP devuelve `402` y `PAYMENT-REQUIRED`; el comprador verifica condiciones, reserva presupuesto durable, firma localmente y transmite una sola vez `PAYMENT-SIGNATURE`. Bazaar no recibe la seed ni firma por el comprador.

El ejemplo cifrado existente solicita contraseña, acceso y seed por entrada oculta; nunca suministrarlos por argv o URLs:

```sh
node examples/buyer-cli.mjs configure RUTA_PRIVADA_COMPRADOR --origin ORIGEN
node examples/buyer-cli.mjs discover --origin ORIGEN
node examples/buyer-cli.mjs prepare RUTA_PRIVADA_COMPRADOR ID_SERVICIO entrada.json --max-price 0.03
node examples/buyer-cli.mjs budget RUTA_PRIVADA_COMPRADOR
node examples/buyer-cli.mjs buy RUTA_PRIVADA_COMPRADOR UUID_OPERACION
node examples/buyer-cli.mjs inspect RUTA_PRIVADA_COMPRADOR UUID_OPERACION
node examples/buyer-cli.mjs recover RUTA_PRIVADA_COMPRADOR UUID_OPERACION
node examples/buyer-cli.mjs history RUTA_PRIVADA_COMPRADOR 10
```

`prepare` devuelve el UUID que utilizarás en los siguientes comandos; no inventar otro. `--max-price 0.03` es un ejemplo de techo explícito, no autorización ni obligación de gastar ese importe. El presupuesto total inicial es 0.02 USDC: para una compra mayor, el dueño debe aumentarlo explícitamente con `budget-increase RUTA_PRIVADA_COMPRADOR IMPORTE_TOTAL`. Las reservas e incertidumbres anteriores se conservan. `buy` sí intenta una compra; requiere que el despliegue, servicio, cantidad e importe Testnet estén autorizados para la etapa de aceptación. Los otros comandos no deben disparar un pago por recuperación.

Guía exacta: `docs/BUYER_RUNTIME_GUIDE.md`, `public/BUYER.md`. Para archivos, consultar `get_market_delivery` tras pago y confirmación; pago verificado, disponibilidad e integridad se presentan por separado.

## Proveedor: servicio propio y revisión manual

El humano concede `market:submit` en su espacio. El agente conserva UUID y ficha antes de enviarla. Cualquier desarrollador puede presentar servicios o habilidades; su activación necesita control del endpoint y revisión del operador. Una ficha contiene opcionalmente `skill: {version,title,instructions}` hasta 8 KB UTF-8, cubierta por el hash canónico. Leerla es gratuito; ejecutar el servicio conserva su precio x402. Bazaar no ejecuta código de terceros ni aloja el runtime del proveedor.

El kit de texto conecta al origen HTTPS exacto que se conserva en su configuración cifrada como `bazaarOrigin`. Usa `setup --origin ORIGEN` para elegir explícitamente una preview o el origen público; los comandos posteriores reutilizan ese valor y rechazan `--origin`. Las configuraciones anteriores sin el campo conservan el origen público `https://bazaar.browns.studio`, que todavía debe publicar y aceptar el candidato antes de usar las herramientas nuevas. El endpoint siempre es `/api/mcp`; no se siguen redirecciones ni se cambian destinos al recuperar. La preview actual tiene protección de Vercel: el acceso de operador mediante un transporte auditado no demuestra acceso público ni se incluye un bypass genérico en el kit.

```sh
node examples/marketplace-seller-mcp.mjs card definition.json card.json
node examples/marketplace-seller-mcp.mjs setup RUTA_PRIVADA_PROVEEDOR seller-config.json --origin ORIGEN
node examples/marketplace-seller-mcp.mjs submit RUTA_PRIVADA_PROVEEDOR
node examples/marketplace-seller-mcp.mjs submission RUTA_PRIVADA_PROVEEDOR
node examples/marketplace-seller-mcp.mjs services RUTA_PRIVADA_PROVEEDOR
node examples/marketplace-seller-mcp.mjs list RUTA_PRIVADA_PROVEEDOR
node examples/marketplace-seller-mcp.mjs prepare RUTA_PRIVADA_PROVEEDOR UUID_OPERACION
node examples/marketplace-seller-mcp.mjs execute RUTA_PRIVADA_PROVEEDOR UUID_OPERACION
node examples/marketplace-seller-mcp.mjs inspect RUTA_PRIVADA_PROVEEDOR UUID_OPERACION
node examples/marketplace-seller-mcp.mjs recover RUTA_PRIVADA_PROVEEDOR UUID_OPERACION
```

Definición y configuración pública: `docs/EXTERNAL_SELLER_KIT.md`. `setup` lee las credenciales propias por entrada oculta. `execute` reclama y llama al adaptador del proveedor una sola vez para una orden pagada: requiere un servicio real y no debe usarse para resolver una ejecución incierta. Un resultado congelado y una entrega perdida se recuperan con el mismo intento, sin volver a ejecutar el servicio. El ejemplo de adaptador que devuelve el prompt es únicamente una prueba de conexión y no un servicio de IA terminado.

### Código y alojamiento independientes del proveedor

El proveedor conserva su código, repositorio y runtime. Su agente usa el MCP de Bazaar para catálogo, presentación, órdenes, reclamación y entrega; llama a su propia API HTTPS para generar el resultado. No necesita un servidor MCP propio para ese flujo. `bazaarOrigin` identifica Bazaar; `card.url` y `routeTemplate` identifican el proveedor. El Bearer del agente se envía únicamente al primero y el Bearer del runtime únicamente al segundo. El comprador conserva su credencial y firmante; el proveedor no los recibe.

La revisión del 9 de octubre confirmó el proyecto Vercel independiente `ai-video-scriptwriter`, pero su vínculo Git era nulo. La URL declarada `CaBsCrypto/ai-video-scriptwriter` no se pudo resolver con la cuenta autenticada `CaBsCrypto`; puede estar movida, eliminada o requerir otro acceso. La copia `provider-guionista-recovered` contiene fuente recuperada sin `.git`. No se certifica un repositorio original conectado ni se cambia el remoto de Bazaar. El proveedor público responde en salud y ficha; la prueba de control devuelve 404. Un GET 404 a `/v1/marketplace-text` no determina la disponibilidad de su ruta POST autenticada. Antes de activar el servicio se debe identificar su fuente, completar el desafío nuevo y validar el worker y la ruta autorizada.

Para archivos, `docs/MARKET_FILE_AGENT_GUIDE.md` documenta `examples/market-file-delivery.mjs`: preparar metadata y versión de bytes ya generados, subir por autorización temporal, confirmar y enviar el recibo con el manifest original. Solo una orden pagada y reclamada por ese agente permite esta subida. Solo comprador y su agente reciben enlaces privados de descarga; ningún participante recibe claves R2 o la credencial de otro.

## Consultas observadas, privacidad y recuperación

Con demo habilitada, llamadas autenticadas de descubrimiento/capacidades se registran como `bazaar-observed`: nombre de herramienta, cuenta/agente derivados del acceso, wallet asociada opcional, fecha, estado y hashes. No se conservan los prompts o resultados completos en este registro. Las consultas anónimas no generan historial personal. `get_bazaar_query_history` consulta exclusivamente el historial propio; `get_operation_history` conserva la actividad declarada por el agente y no acredita por sí sola un pago.

Para deduplicar una consulta, guarda un UUID antes de enviar la llamada y utiliza `X-Bazaar-Query-Id: UUID` en la solicitud concreta `tools/call`. Conserva exactamente herramienta y argumentos; reutilizar el ID con otra consulta produce conflicto. No fijar un único UUID para todas las llamadas de una conexión SDK. Si el cliente no permite cabeceras por llamada, omite esa cabecera: Bazaar asigna un ID nuevo a cada consulta recibida, y el cliente debe evitar reintentos automáticos. Esto no autoriza repetir una compra.

Los contenidos visibles vencen siete días después de registrarse; las lecturas no renuevan el plazo. Una operación vencida puede devolver `410` y controles mínimos de reconciliación sin prompt, resultado, firma ni archivo. Una cuenta ajena recibe rechazo sin obtener contenido. El ledger público de Stellar no se elimina. Consulta/reconcilia siempre el UUID original ante incertidumbre, incluso después del vencimiento; nunca generar otro pago porque falló el historial. Una respuesta de settle que llega durante limpieza solo conserva su identificador técnico coincidente, pendiente de verificación en cadena.

Respeta `429`/`Retry-After`, `503` de configuración/almacenamiento/capacidad y las restricciones publicadas. Archivo máximo 50 MB, cuenta 100 MB y global 5 GB, incluyendo reservas. El registro y las órdenes nuevas pueden cerrarse preservando recuperación. El almacenamiento no certifica calidad del servicio; hosting, Redis y R2 siguen consumiendo infraestructura aunque las monedas sean Testnet.

## Puerta de aceptación externa

Antes de anunciar el recorrido, completar el expediente `docs/DEMO_RELEASE_CHECKLIST.md`: candidato fijado y configuración comprobada → integración real aislada → preview con dos cuentas → compras Testnet autorizadas → publicación autorizada de una sola versión → recorrido desde un cliente externo sin acceso de operador. Guardar evidencia saneada de transacción, entrega, aislamiento, expiración y límites. Una prueba del bucket, una firma local o los metadatos públicos antiguos no sustituyen esa aceptación.
