# Recorrido reproducible: humano y agente externo sintético

Este paquete complementa `/WORKSPACE_AGENT.md`. Su base es el candidato local
`61bcb685`; el expediente final identifica el SHA exacto que incorpora las
correcciones del sprint. Usa el helper existente y MCP real; la respuesta es texto fijo
generado localmente, sin modelo, proveedor, pago ni archivo externo. Una ejecución
con backend file demuestra el recorrido local; no cuenta como Redis real.

## Entrada que recibe el desarrollador

> Lee /WORKSPACE_AGENT.md y las skills buyer y recovery de este origen. Consulta
> get_bazaar_capabilities y tools/list. Crea mi espacio con tres accesos distintos
> conservados antes del alta. Delega únicamente agent.json. Envía el mensaje humano,
> reclama su tarea y conserva una respuesta sintética y entrega inline antes de
> registrarlas. Recupera exactamente la misma conversación y entrega. Ante un fallo
> de registro, reenvía únicamente el archivo ya conservado; no generes otra respuesta.

Requisitos: checkout identificado, Node 22.18+, dependencias existentes, un origen
entregado por el operador con espacios habilitados y dos directorios privados nuevos
fuera del checkout. El operador conserva la configuración del servidor. Este paquete
no autoriza escrituras Redis externas ni modifica esa configuración.

En los comandos siguientes `CHECKOUT`, `OWNER`, `AGENT` y `ORIGIN` son valores locales
que sustituye el desarrollador; no son secretos. Ejecuta los comandos desde CHECKOUT.
Usa el origen exacto (por ejemplo `http://127.0.0.1:3286`), sin añadir `/api/mcp`.
No cargues `.env`. En Windows admite rutas absolutas entre comillas. No copies tokens
a terminal, capturas, prompts ni informes.

Primero consulta sin Authorization `GET ORIGIN/api/mcp`, `/api/openapi`,
`/WORKSPACE_AGENT.md` y `/skills/buyer/SKILL.md`, `/skills/recovery/SKILL.md`.
Con tu cliente MCP de descubrimiento, también sin Authorization, confirma las 17
herramientas y `get_bazaar_capabilities.workspace.enabled === true`. Si está cerrado,
conserva los archivos y registra el bloqueo; no declares un alta exitosa.
Configura también `reconnectionOptions: {maxRetries:0, initialReconnectionDelay:1000,
maxReconnectionDelay:1000, reconnectionDelayGrowFactor:1}` en el SDK MCP. No dejes
reconexiones de transporte por defecto: incluso un stream SSE cerrado puede generar
solicitudes GET adicionales. El helper aplica esa configuración y cierra cada cliente.

## Preparar los accesos y el mensaje humano

```sh
node examples/agent-workspace-mcp.mjs prepare OWNER ORIGIN
```

Antes de `create` deben existir `workspace-root.json`, `agent.json` y
`human-links.txt`. La raíz contiene `creationId`, `bootstrapAccess` (recuperación),
`humanAccess` y `agentAccess`, distintos y aleatorios, más los hashes de alta.
El helper protege el directorio y rechaza sobrescribir uno existente. Guarda la raíz
y enlaces con el dueño. Es la única copia de recuperación; Bazaar conserva hashes.

Guarda este bloque como `human-demo.mjs` dentro de OWNER. Todos sus POST reutilizan
la intención escrita antes de enviar. No imprime accesos. `delegate` crea AGENT con
los permisos del helper y copia únicamente `agent.json`.

<!-- handoff-script:human-demo.mjs -->
```js
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const [mode, checkout, directory, delegated] = process.argv.slice(2);
const dir = resolve(directory);
const {preparePrivateDirectory, verifyPrivateDirectory} = await import(pathToFileURL(resolve(checkout, 'scripts/history-private-files.mjs')));
verifyPrivateDirectory(dir);
const root = JSON.parse(readFileSync(resolve(dir, 'workspace-root.json'), 'utf8'));
assert.equal(new Set([root.bootstrapAccess, root.humanAccess, root.agentAccess]).size, 3);
const intentionFile = resolve(dir, 'human-intent.json');
if (mode === 'prepare') {
  const intent = {conversationId: randomUUID(), messageId: randomUUID(), taskId: randomUUID(), title: 'Mi ejemplo sintético', text: 'Prepara un ejemplo inline gratuito y conserva la entrega de esta tarea.'};
  writeFileSync(intentionFile, JSON.stringify(intent, null, 2), {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify({prepared: true, taskId: intent.taskId}));
} else if (mode === 'delegate') {
  const target = preparePrivateDirectory(delegated);
  writeFileSync(resolve(target, 'agent.json'), readFileSync(resolve(dir, 'agent.json')), {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify({delegated: true, files: ['agent.json']}));
} else {
  const intent = JSON.parse(readFileSync(intentionFile, 'utf8'));
  async function http(path, body) {
    const response = await fetch(new URL(path, root.origin), {method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: {Authorization: `Bearer ${root.humanAccess}`, ...(body ? {'Content-Type': 'application/json', Origin: root.origin} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    if (!response.ok) throw Error(`HTTP ${response.status}; conserva la misma intención`);
    return response.json();
  }
  if (mode === 'send') {
    await http('/api/conversations', {conversationId: intent.conversationId, title: intent.title});
    await http(`/api/conversations/${intent.conversationId}/messages`, {messageId: intent.messageId, taskId: intent.taskId, text: intent.text});
    console.log(JSON.stringify({sent: true, conversationId: intent.conversationId, taskId: intent.taskId}));
  } else if (mode === 'verify') {
    const {conversation} = await http(`/api/conversations/${intent.conversationId}/messages`);
    const {records} = await http('/api/operations');
    assert.equal(conversation.messages.filter(m => m.actor === 'human' && m.messageId === intent.messageId).length, 1);
    const answers = conversation.messages.filter(m => m.actor === 'agent' && m.taskId === intent.taskId);
    assert.equal(answers.length, 1);
    const operations = records.filter(r => r.taskId === intent.taskId);
    assert.equal(operations.length, 1);
    assert.equal(answers[0].operationId, operations[0].clientOperationId);
    const result = {conversation, records: operations};
    const receipt = resolve(dir, 'human-recovery-receipt.json');
    if (existsSync(receipt)) assert.deepEqual(result, JSON.parse(readFileSync(receipt, 'utf8')));
    else writeFileSync(receipt, JSON.stringify(result, null, 2), {flag: 'wx', mode: 0o600});
    console.log(JSON.stringify({sameConversationAndDelivery: true, humanMessages: 1, agentMessages: 1, operations: 1, taskId: intent.taskId, operationId: operations[0].clientOperationId}));
  } else throw Error('Usa prepare, delegate, send o verify');
}
```

```sh
node OWNER/human-demo.mjs prepare CHECKOUT OWNER
node examples/agent-workspace-mcp.mjs create OWNER
node examples/agent-workspace-mcp.mjs create OWNER
node OWNER/human-demo.mjs delegate CHECKOUT OWNER AGENT
node OWNER/human-demo.mjs send CHECKOUT OWNER
```

La segunda alta recupera el mismo espacio y conserva `creation-receipt.json` sin
sobrescribirlo. Guarda el `taskId` que imprime `send`. Repetir `send` recupera la misma
conversación y mensaje; no crea otra tarea. Si un POST no se confirma, detente y
conserva `human-intent.json`; la recuperación es una repetición explícita.

## El agente usa únicamente su paquete delegado

```sh
node examples/agent-workspace-mcp.mjs tasks AGENT
node examples/agent-workspace-mcp.mjs claim AGENT TASK_ID
```

Comprueba en `AGENT/responses/` que la tarea coincide con el texto humano y en
`AGENT/attempts/TASK_ID.json` que existe un `attemptId` fijo. El agente no necesita
`workspace-root.json`, el acceso humano ni el secreto de recuperación.

Guarda el bloque siguiente como `fixture-demo.mjs` dentro de AGENT. `freeze` produce
una sola vez los tres archivos privados; repetirlo verifica exactamente los mismos
bytes, sin generar respuesta, identificadores ni resultado nuevos. Usa el `taskId`
real reclamado. No edites esos archivos para recuperarte de un fallo.

<!-- handoff-script:fixture-demo.mjs -->
```js
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
const [checkout, directory, taskId] = process.argv.slice(2);
const dir = resolve(directory);
const {verifyPrivateDirectory} = await import(pathToFileURL(resolve(checkout, 'scripts/history-private-files.mjs')));
verifyPrivateDirectory(dir);
const agent = JSON.parse(readFileSync(resolve(dir, 'agent.json'), 'utf8'));
assert.deepEqual(Object.keys(agent).sort(), ['agentAccess', 'origin', 'version', 'workspace']);
const attempt = JSON.parse(readFileSync(resolve(dir, 'attempts', `${taskId}.json`), 'utf8'));
assert.equal(attempt.taskId, taskId);
const manifestFile = resolve(dir, 'fixture-manifest.json');
const digest = text => createHash('sha256').update(text).digest('hex');
if (existsSync(manifestFile)) {
  const frozen = JSON.parse(readFileSync(manifestFile, 'utf8'));
  assert.equal(frozen.taskId, taskId);
  for (const [name, expected] of Object.entries(frozen.files)) assert.equal(digest(readFileSync(resolve(dir, name), 'utf8')), expected);
  console.log(JSON.stringify({conserved: true, generated: false, operationId: frozen.operationId}));
} else {
  const operationId = `demo-${randomUUID()}`;
  const operation = {clientOperationId: operationId, taskId, mode: 'mock', service: {id: 'ejemplo-gratuito', title: 'Ejemplo inline sin pago', provider: 'Agente externo sintético', url: agent.origin}, payment: {status: 'not-requested', network: 'stellar:testnet', asset: 'NO_PAYMENT', amountAtomic: '0', recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'}, delivery: {status: 'reported-delivered', result: {simulation: true, summary: 'Resultado sintético conservado una sola vez, sin modelo ni transferencia.'}}};
  const activity = {eventId: `demo-${randomUUID()}`, taskId, operationId, mode: 'mock', kind: 'delivery-reported', title: 'Ejemplo inline disponible', result: {simulation: true}};
  const response = {text: 'Tu ejemplo sintético está conservado en la biblioteca. No se ejecutó ningún pago.', operationId};
  const files = {};
  for (const [name, value] of Object.entries({'operation.json': operation, 'activity.json': activity, 'response.json': response})) {
    const bytes = JSON.stringify(value, null, 2);
    writeFileSync(resolve(dir, name), bytes, {flag: 'wx', mode: 0o600});
    files[name] = digest(bytes);
  }
  writeFileSync(manifestFile, JSON.stringify({taskId, operationId, files}, null, 2), {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify({conserved: true, generated: true, operationId}));
}
```

```sh
node AGENT/fixture-demo.mjs CHECKOUT AGENT TASK_ID
node examples/agent-workspace-mcp.mjs record AGENT AGENT/operation.json
node examples/agent-workspace-mcp.mjs activity AGENT AGENT/activity.json
node examples/agent-workspace-mcp.mjs respond AGENT TASK_ID AGENT/response.json
node examples/agent-workspace-mcp.mjs recover AGENT
node OWNER/human-demo.mjs verify CHECKOUT OWNER
```

Ejecuta cada comando y comprueba su salida/exit code antes del siguiente. La respuesta
y entrega quedan guardadas antes de registrar. Solo después del registro confirmado
se envía la respuesta vinculada. El helper fija también `messageId`, texto y
`attemptId` antes de `respond`.

Si `record` falla, conserva `operation.json`, `response.json`, `fixture-manifest.json`
y las respuestas privadas. Reintenta únicamente el mismo comando `record`, de forma
explícita y respetando `Retry-After`. Ante un acuse incierto, consulta `recover` primero
para comprobar la misma operación. No vuelvas a ejecutar un proveedor, modelo,
compra, `prepare` ni un `claim` con otro ID. El servidor rechaza contenido distinto
con el mismo identificador. Un error no es un comprobante de entrega.

Para comprobar idempotencia sin inducir fallos en Redis, repite una vez `record`,
`activity` y `respond` con estos archivos, luego `verify`. Debe conservar una respuesta,
una operación y el mismo comprobante. Fallos inducidos se prueban con dobles locales.

## Navegador, reinicio y aislamiento

Abre el enlace chat de `OWNER/human-links.txt` de forma privada. El token debe
desaparecer de la URL antes de cargar datos. Pulsa **Actualizar mensajes** y comprueba
un mensaje humano y una respuesta del agente con la misma referencia de operación.
**Abrir mi biblioteca** muestra la entrega y **Sin pago**. Para consultar la etiqueta **Simulación**, abre **Últimas operaciones · vista técnica detallada**.

En 390×844 y 1366×768 comprueba controles visibles, líneas largas, actividad y
resultado original. Repite con texto o zoom al 200 %; verifica la ampliación efectiva
mediante tamaño calculado de texto o métricas del navegador antes/después. Una captura
normal o un atajo sin efecto no cuenta. Revisa teclado, foco visible y que no haya
controles ocultos ni desplazamiento horizontal que impida usarlos.

Escribe un borrador sin enviarlo, pulsa **Bloquear**, confirma que desaparecen mensajes,
borrador y entrega. Reabre el enlace original en la misma pestaña: el borrador debe
seguir vacío. Una respuesta tardía no debe desbloquear ni restaurar datos. La biblioteca
tiene su propio botón **Bloquear y borrar vista**; bloquear una vista no revoca el enlace.

El operador reinicia la aplicación conservando exactamente backend, prefijo/directorio
y origen. Reabre el Magic Link y ejecuta `verify`: debe coincidir byte a byte en los
registros JSON conservados, sin volver a ejecutar el ejemplo. No ejecutes `prepare`
ni generes nuevas credenciales para recuperarlo.

Para otro propietario B repite preparación y alta en otros dos directorios nuevos;
debe ver su chat/biblioteca vacíos. Con el acceso humano B, la conversación de A debe
devolver 404 y su historial no debe incluir la operación de A. El acceso humano no
reclama tareas ni registra operaciones; el secreto de recuperación no lee el chat.
No uses el paquete A en la vista de B ni infieras permisos a partir de IDs.

Guarda evidencia redactada: SHA, Node, origen, backend, configuración sin secretos,
comandos, resultado, IDs/conteos, comparación después del reinicio, tamaños/zoom y
capturas sin URL/token ni campo de acceso visible. Separa local file/dobles, navegador
real, Redis real autorizado y pendientes. Este paquete no activa solicitudes de
proveedor ni publica servicios.
