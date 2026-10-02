# Reutilizar los proveedores que ya existen

El 2026-10-02 se comprobaron dos fichas públicas mediante GET, sin ejecutar el
proveedor ni pagar: Guionista de Video IA (HTTP 200, USDC 0.02, JSON) y Website
Intelligence (HTTP 200, pago USDC habilitado en su contrato). La evidencia está en
`evidence/sprint-marketplace/existing-provider-readonly.json`. No se afirma que
sus endpoints pagados, sus credenciales o un agente MCP se hayan probado hoy.

El marketplace nuevo admite por ahora XLM nativo testnet y entrega de texto.
Esto es una limitación del candidato, no una decisión del plan que excluya USDC
en todos los sprints. Las fichas históricas conservan sus contratos y precios.
No se puede copiar su ficha USDC/JSON y declararla compatible con este flujo.

Para reutilizar un proveedor, su propietario publica una ficha nueva de servicio
de texto, con un identificador distinto y precio/destinatario testnet explícitos.
El mismo endpoint HTTPS y el mismo proyecto pueden demostrar control mediante
el archivo well-known indicado en Mis servicios. La revisión manual debe
comprobar qué entrega se ofrece y que no exista un segundo pago implícito.

Su agente continúa corriendo fuera de Bazaar y utiliza el acceso de agente de su
espacio. Puede generar el texto usando la infraestructura existente. Bazaar no
llama automáticamente al endpoint pagado anterior, no lanza modelos del vendedor
y no convierte USDC en XLM. Si se requiere conservar exactamente USDC/x402, esa
adaptación de liquidación todavía debe implementarse y probarse; no activar esa
ficha con el candidato XLM.

Conexión MCP: `<origen HTTPS>/api/mcp`, bearer de agente, sin reconexión
automática. Con la Preview protegida, el operador debe proporcionar además el
mecanismo aprobado de autenticación de Vercel; no desactivar protección.

Ejemplo externo: `examples/marketplace-seller-mcp.mjs`, Node 22 y el SDK MCP del
proyecto. Variables privadas `BAZAAR_ORIGIN` y `BAZAAR_AGENT_ACCESS`.

1. `node examples/marketplace-seller-mcp.mjs inspect`: consulta pedidos privados.
2. `node examples/marketplace-seller-mcp.mjs prepare intent.json <operationId>`:
   guarda una referencia de ejecución sin efectos remotos.
3. `node examples/marketplace-seller-mcp.mjs claim intent.json`: reclama el pedido
   pagado. Un intento anterior debe inspeccionarse, nunca ejecutar de nuevo por
   haber perdido una respuesta.
4. El agente produce texto por su cuenta. `node examples/marketplace-seller-mcp.mjs
   save-text intent.json result.txt` congela hasta 2000 caracteres y su hash.
5. `node examples/marketplace-seller-mcp.mjs deliver intent.json.delivery.json`
   transmite esa entrega. Ante incertidumbre, conservar el archivo e inspeccionar.

El ejemplo es un cliente, no un nuevo hosting. No ejecuta código ajeno, no genera
wallets, no firma, no paga y no envía invitaciones.
