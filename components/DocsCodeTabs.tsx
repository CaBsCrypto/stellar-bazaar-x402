"use client";

import { useState } from "react";

type TabId = "mcp" | "typescript" | "python" | "curl";

interface Tab {
  id: TabId;
  label: string;
  badge: string;
  language: string;
  description: string;
  code: string;
}

const TABS: Tab[] = [
  {
    id: "mcp",
    label: "Claude Desktop & Cursor (MCP)",
    badge: "1-Click Config",
    language: "json",
    description: "Agrega Stellar Bazaar a tu archivo claude_desktop_config.json o configuración de Cursor IDE. Cero instalación local requerida.",
    code: `{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "https://stellar-bazaar-x402.vercel.app/api/mcp"
    }
  }
}`
  },
  {
    id: "typescript",
    label: "TypeScript / Node.js",
    badge: "Autonomous Agent",
    language: "typescript",
    description: "Cliente autónomo con auto-pago x402 en Stellar Testnet / Mainnet usando @x402/stellar y @x402/fetch.",
    code: `import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactStellarScheme, createEd25519Signer } from "@x402/stellar";

// 1. Configura el firmante con tu llave privada de Stellar (ej. Testnet)
const signer = createEd25519Signer(process.env.STELLAR_SECRET_KEY!, "stellar:testnet");

// 2. Inicializa el cliente x402 registrando el esquema de Stellar
const client = new x402Client().register("stellar:testnet", new ExactStellarScheme(signer));
const paidFetch = wrapFetchWithPayment(fetch, client);

// 3. Invoca cualquier servicio de Stellar Bazaar. El pago se resuelve automáticamente si devuelve HTTP 402!
const res = await paidFetch(
  "https://stellar-bazaar-x402.vercel.app/api/x402/swap-risk?pair=XLM/USDC&amount=2500&side=buy"
);

const data = await res.json();
console.log("Resultado verificado del servicio:", data);`
  },
  {
    id: "python",
    label: "Python (LangChain & CrewAI)",
    badge: "AI Tool",
    language: "python",
    description: "Herramienta personalizada para que agentes en Python busquen servicios en Stellar Bazaar y paguen con su wallet de Stellar.",
    code: `import requests
from stellar_sdk import Keypair, Server, Network
from langchain.tools import tool

BAZAAR_URL = "https://stellar-bazaar-x402.vercel.app"

@tool
def call_stellar_bazaar_service(service_path: str) -> dict:
    """Busca y ejecuta un servicio en Stellar Bazaar x402 pagando con USDC."""
    # 1. Petición inicial para obtener el desafío HTTP 402
    url = f"{BAZAAR_URL}{service_path}"
    res = requests.get(url)
    
    if res.status_code == 402:
        # Desafío recibido: PAYMENT-REQUIRED v2
        payment_header = res.headers.get("PAYMENT-REQUIRED")
        # Tu agente firma la autorización Ed25519 con su Keypair de Stellar
        # y reenvía con cabecera PAYMENT-SIGNATURE
        # (Ver docs/LANGCHAIN_CREWAI.md para el flujo completo de firma)
        pass
    
    return res.json()

# Listo para usar en agentes de LangChain, CrewAI o AutoGen!`
  },
  {
    id: "curl",
    label: "cURL / Raw HTTP",
    badge: "Terminal Protocol",
    language: "bash",
    description: "Flujo paso a paso con cURL demostrando el desafío HTTP 402 Payment Required del protocolo x402.",
    code: `# Paso 1: Petición inicial sin pago (Devuelve HTTP 402 con requerimientos de pago en encabezado)
curl -i "https://stellar-bazaar-x402.vercel.app/api/x402/swap-risk?pair=XLM/USDC&amount=2500&side=buy"

# Respuesta esperada:
# HTTP/2 402 Payment Required
# payment-required: {"network":"stellar:testnet","scheme":"exact","amount":"10000","asset":"USDC",...}

# Paso 2: Petición con firma de autorización Ed25519
curl -i "https://stellar-bazaar-x402.vercel.app/api/x402/swap-risk?pair=XLM/USDC&amount=2500&side=buy" \\
  -H "PAYMENT-SIGNATURE: eyJhbGciOiJFZDI1NTE5Iiwic2lnbmF0dXJlIjoi..."`
  }
];

export function DocsCodeTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("mcp");
  const [copied, setCopied] = useState(false);

  const current = TABS.find((t) => t.id === activeTab) || TABS[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="docs-code-container">
      <div className="docs-tabs-header">
        <div className="docs-tab-buttons">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`docs-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            >
              <span>{tab.label}</span>
              <span className="docs-tab-badge">{tab.badge}</span>
            </button>
          ))}
        </div>
        <button onClick={handleCopy} className="docs-copy-btn" title="Copiar código">
          {copied ? "✓ Copiado!" : "Copiar"}
        </button>
      </div>

      <div className="docs-tab-content">
        <p className="docs-tab-desc">{current.description}</p>
        <pre className="docs-code-block">
          <code className={`language-${current.language}`}>{current.code}</code>
        </pre>
      </div>
    </div>
  );
}
