# 🤖 Agent Integration Quickstart · Stellar Bazaar x402

Guía completa para integrar agentes de IA autónomos con **Stellar Bazaar x402**, permitiendo descubrir, evaluar y pagar micropagos x402 sobre la red Stellar de forma desatendida y segura.

---

## 1. Conexión Rápida al Servidor MCP (Streamable HTTP)

El servidor MCP de Stellar Bazaar expone 11 herramientas estándar bajo la especificación RFC JSON-RPC 2.0 / `2025-11-25`:

* **Endpoint MCP:** `http://localhost:3000/api/mcp` (o tu URL pública de Vercel)
* **Herramientas Disponibles — lectura (7):**
  * `get_bazaar_capabilities`: Consulta transporte, esquemas soportados y políticas de no-custodia.
  * `list_services`: Lista los servicios disponibles y pilotos.
  * `search_services`: Búsqueda determinista por lenguaje natural y tags.
  * `get_service`: Inspecciona los metadatos completos y esquemas I/O de una Service Card por ID.
  * `validate_service_card`: Valida la conformidad estricta de una Service Card.
  * `list_workflow_bundles`: Lista los workflow bundles read-only (composiciones de capacidades).
  * `get_workflow_bundle`: Inspecciona un bundle y su conformance determinista.
* **Escrituras de registro (4):** `register_service`, `update_service`, `delete_service` y `list_my_services`. Todas requieren el argumento `providerKey` (secreto compartido; ver [PROVIDER_ONBOARDING.md](PROVIDER_ONBOARDING.md)).

---

## 2. Configuración en IDEs y Asistentes

### A. Claude Desktop (`claude_desktop_config.json`)
Añade la siguiente configuración en tu archivo de configuración de Claude Desktop:

```json
{
  "mcpServers": {
    "stellar-bazaar": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp"]
    }
  }
}
```

### B. Cursor / Windsurf (`.cursor/mcp.json` o `mcp_config.json`)
```json
{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

---

## 3. Integración con Frameworks de Agentes

### A. TypeScript / Node.js con `BazaarAgentClient`
El SDK oficial permite a cualquier agente descubrir y pagar en solo 3 líneas de código:

```typescript
import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

// 1. Inicializar cliente con clave de Testnet y presupuesto máximo
const client = new BazaarAgentClient({
  baseUrl: "http://localhost:3000",
  payerSecretKey: process.env.X402_PAYER_SECRET,
  maxPriceAllowedUsdc: 0.05, // Límite de seguridad
});

// 2. Descubrir servicio
const [card] = await client.searchServicesMCP("riesgo swap");

// 3. Ejecutar y pagar automáticamente con x402
const result = await client.executeService(card, {
  pair: "XLM/USDC",
  amount: 2500,
  side: "buy",
});

console.log("Resultado:", result.data);
console.log("Transacción Stellar:", result.payment.receiptUrl);
```

### B. LangChain / LangGraph (Python)
```python
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

async def main():
    async with MultiServerMCPClient() as mcp_client:
        await mcp_client.connect_to_server(
            "stellar-bazaar",
            url="http://localhost:3000/api/mcp",
            transport="streamable-http"
        )
        tools = mcp_client.get_tools()
        model = ChatOpenAI(model="gpt-4o")
        agent = create_react_agent(model, tools)
        
        # El agente consulta las capacidades de Stellar Bazaar
        response = await agent.ainvoke({
            "messages": [{"role": "user", "content": "Busca servicios de análisis de swaps en Stellar Bazaar"}]
        })
        print(response["messages"][-1].content)
```

### C. CrewAI
```python
from crewai import Agent, Task, Crew
from crewai.tools import BaseTool
import requests

class BazaarDiscoveryTool(BaseTool):
    name: str = "stellar_bazaar_search"
    description: str = "Busca servicios y herramientas pagadas en Stellar Bazaar"

    def _run(self, query: str) -> str:
        res = requests.get(f"http://localhost:3000/api/discovery/search?query={query}")
        return res.text

discovery_agent = Agent(
    role="Stellar Service Scout",
    goal="Encontrar las mejores APIs de pago en la red Stellar",
    backstory="Eres un agente especializado en localizar APIs HTTP y MCP pagadas mediante x402.",
    tools=[BazaarDiscoveryTool()],
    verbose=True
)
```

---

## 4. 🛡️ Políticas de Seguridad Obligatorias

1. **Aislamiento Total de Claves Privadas**:
   * Las claves secretas (`X402_PAYER_SECRET` / seeds) **NUNCA** deben incluirse en prompts de LLM, mensajes de sistema ni transmitirse por la red.
   * La firma Ed25519 ocurre exclusivamente en el entorno de ejecución local del agente (`server-only`).
2. **Defensa en Profundidad (Hard-Caps)**:
   * Define siempre un `maxPriceAllowedUsdc` en el cliente. Si un proveedor exige un monto mayor, la petición se aborta antes de firmar.
3. **Protección Anti-Bucle (Circuit Breaker)**:
   * El cliente limita los reintentos a 1 solo handshake de pago por solicitud HTTP.
