# Historial privado de operaciones / Private operation history

## Para la persona / For the human

ES: Abre `/history`, introduce el acceso de lectura que el operador asignó a tu historial y consulta las últimas 20 operaciones. Puedes ver servicio, proveedor, agente declarado cuando existe, fecha, monto atómico, activo, red, destinatario abreviado y estados separados de pago y entrega. Los resultados almacenados aparecen como texto JSON al expandirlos. Bloquear borra acceso y registros de la vista. No se guarda el token en URL, localStorage o sessionStorage. El historial no interrumpe al agente ni añade confirmación humana por compra.

EN: Open `/history`, enter the read access assigned by the operator to your history, and view the latest 20 operations. Entries show service, provider, declared agent when available, timestamp, atomic amount, asset, network, shortened recipient and separate payment/delivery states. Stored results expand as JSON text. Lock clears access and records from the view. The token is not stored in URLs, localStorage or sessionStorage. History does not interrupt agents or add human approval per purchase.

## Configuración y acceso / Configuration and access

The server requires durable Redis storage and `BAZAAR_HISTORY_ACCOUNTS_JSON`, an array of `{ownerId, readTokenHash, writeTokenHash}`. The operator assigns independent high-entropy read and write tokens, stores only their SHA-256 hashes in this server configuration and delivers raw tokens through a private channel. Never use wallet seeds, facilitator credentials or general Redis credentials as access tokens. See the history module and environment example for accepted token format and storage variable names. No account or secret is created by visiting the page.

`GET /api/operations?limit=20` accepts `Authorization: Bearer <read token>` and returns `{version:"1",records:[...]}` scoped to that token's owner. A read token cannot append records. The optional agent journal uses its separate write access to `POST /api/operations`. Credentials are sent as headers, never query parameters. Generic errors cover invalid access, disabled/unavailable storage and invalid records. The browser never prints server error bodies or tokens.

ES: Si el historial está deshabilitado, vacío o inaccesible, la página lo indica. No inventa operaciones ni reconstruye compras desde transferencias antiguas. Cada acceso corresponde a su propio historial; compartir el token permite leerlo.

EN: Disabled, empty and unavailable states are explicit. The page invents no operations and does not reconstruct purchases from old transfers. Each access is scoped to its own history; sharing the token grants access to that history.

## Evidencia y recuperación / Evidence and recovery

Every stored entry is `agent-reported`. `reported-unverified` means the agent reported a payment; it does not mean Bazaar independently checked the ledger. `reported-delivered` means the agent reported receipt of a result, not that its quality was certified. A hash alone proves neither attribution to a service nor delivery. `fixture`, `mock` and `testnet` remain separate visible modes. Only a syntactically valid hash on a Testnet entry produces a fixed Stellar Expert Testnet link. Provider URLs and result content are rendered as inert text, never HTML or arbitrary navigable links.

`unknown` preserves uncertainty after interrupted execution: settlement may have occurred even if the response was lost. Reconcile with the provider before another paid attempt. Optional SDK journaling records outcomes under buyer policy; `includeResult` defaults to false. If journal persistence fails, `history.status` reports failure separately and must not trigger another payment. A stored result is privately recoverable through the same history access. Results never stored cannot be reconstructed by this journal; provider delivery/recovery remains separate.

## MCP / WebMCP

Public discovery remains separate from private history. The history page can register `bazaar_get_operation_history` directly with a native `navigator.modelContext` supporting registration and removal, only when the reader enables the clearly labelled private read connection. The tool has no token argument; access stays in the page closure. It unregisters and stops returning data when locked, disconnected or unmounted. It is deliberately excluded from the site's emulator instrumentation, which otherwise retains tool output. Unsupported browsers show an unavailable notice and retain ordinary web access. A compatible native-browser smoke is required before claiming native interoperability.

The server MCP integration, where configured, uses authenticated transport access for history. No paid call is added by this history surface. Agent-provided metadata and results remain untrusted data. This feature supplies visibility into recorded operations, not universal agent compatibility, automatic historical attribution, on-chain verification, custody or signing.

## Buyer client / Cliente comprador

Configure `BazaarAgentClient({baseUrl, history: {writeToken, agentId, includeResult: true}, ...buyerOptions})` in the buyer's own process. Supply `writeToken` from that process's secret storage; never include it in a prompt. `includeResult` is optional and defaults to false. Successful executions append automatically, without a human confirmation step. Interrupted executions report `unknown` because a missing response cannot establish that no payment occurred. Invalid/unsupported history metadata can prevent recording; this does not change the payment result. Clients that do not configure this integration do not appear automatically.

ES: El cliente registra operaciones terminadas y reporta estado desconocido al interrumpirse una ejecución. El humano consulta con su acceso de lectura separado. El agente continúa operando; configurar la política de guardado del resultado no agrega aprobaciones por compra.

The journal uses server receipt time, not a client-controlled execution date. Amounts are atomic; the current SDK adapter converts the existing seven-decimal Stellar price convention. Agents using assets with other decimal precision must submit the correct atomic amount directly through the API. Agent IDs are declared labels, not authenticated agent identities. Records are immutable and limited to 1000 per owner; capacity returns an explicit error, with no silent deletion. Pagination beyond the latest 100, retention/deletion policy and account provisioning UI remain future work. Operator removal/rotation of a token hash revokes that access.

Before enabling publicly: configure owner access and durable Redis, test actual Redis restart/concurrency, review retention and private-result policy, and resolve dependency audit findings. This branch does not configure remote secrets or backfill historic purchases.

## Panel por tareas

La ampliación incorpora /api/activity y el panel de tareas dentro de /history. Consulta [la guía de conexión](HUMAN_ACTIVITY_PANEL.md) para pasos, paginación y entregas privadas. /history/review permite revisar el recorrido con datos simulados.
