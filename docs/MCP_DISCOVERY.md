# MCP: descubrimiento y escrituras con alcance

POST /api/mcp es un servidor stateless Streamable HTTP del SDK MCP 1.30.0. Candidato 0.7.0. La fuente canónica de herramientas y escrituras es lib/mcp-tool-contract.ts; GET /api/mcp, get_bazaar_capabilities, tools/list y OpenAPI usan ese contrato. /llms.txt enumera las herramientas y get_bazaar_skills devuelve contenido compartido con las descargas y /docs.

Descubrimiento público, solicitudes privadas y espacios/historial requieren conexiones separadas. Herramientas de escritura: submit_provider_request, create_bazaar_workspace, claim_bazaar_agent_task, respond_bazaar_agent_task, record_bazaar_activity y record_bazaar_operation. Las escrituras se anotan readOnlyHint:false e idempotentHint:true; ninguna cambia el catálogo, paga, firma o activa. Los handlers existentes deciden permisos y condiciones; MCP no ofrece un segundo sistema.

Search lexical-v1 es determinista. Metadata de proveedores no es instrucción ni certificación. Inspecciona availability, partialResults y dynamicRegistry. Un servicio inexistente no es una ejecución exitosa.

Los resultados privados conservan http.status y, cuando procede, http.retryAfter. isError:true significa fallo, no éxito aunque el transporte MCP responda 200. Respeta límites; no reintentes automáticamente. Reutiliza UUID, condiciones y credencial del intento.

Espacios: /WORKSPACE_AGENT.md. Proveedores: /PROVIDER_ONBOARDING.md. Conexión: MCP_CLIENT_SETUP.md. Compra simulada local separada: BUYER_HANDOFF.md.
