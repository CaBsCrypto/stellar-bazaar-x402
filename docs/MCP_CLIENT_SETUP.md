# Conectar un agente a Bazaar

MCP Streamable HTTP: POST /api/mcp. Candidato 0.7.0. Initialize, tools/list y tools/call mediante @modelcontextprotocol/sdk; GET solo informa capacidades. Cada POST lleva Content-Type: application/json y Accept: application/json, text/event-stream.

Usa el origen de tu entorno, explícitamente loopback para pruebas. No mezcles el candidato local con producción. Descubrimiento no necesita Authorization. Para solicitudes configura su token; para tareas e historial configura el acceso del agente. Nunca reutilices credenciales entre esos ámbitos ni uses secretos administrativos. Bootstrap se usa únicamente para crear/renovar/revocar el espacio. Configura el encabezado en el transporte, no en argumentos ni URLs; no sigas redirecciones con credenciales.

Consulta get_bazaar_skills y tools/list, no una cifra histórica de herramientas. La lista canónica y anotaciones están en lib/mcp-tool-contract.ts y /api/mcp. MCP conserva solicitudes y resultados autorizados, pero no firma, paga, ejecuta proveedores ni aprueba/activa servicios. WebMCP es otra interfaz en el navegador.

Requisitos: terminal, Node 22.18+, checkout identificado y npm ci, almacenamiento privado, cliente con Authorization configurable. Los módulos internos no son un paquete SDK publicado. Guías descargables: /WORKSPACE_AGENT.md, /PROVIDER_ONBOARDING.md y /llms.txt.

Ejemplos reproducibles: examples/agent-workspace-mcp.mjs y examples/agent-provider-mcp.mjs. El acceso humano abre /agent-chat y /history; tokens en memoria y retirada del fragmento de URL. Cliente y logs pueden conservar trazas; protege la configuración.
