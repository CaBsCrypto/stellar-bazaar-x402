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
    badge: "Read-only",
    language: "json",
    description: "Conecta el endpoint MCP de discovery. Expone siete tools de lectura, sin firma, pago o escritura.",
    code: `{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "https://stellar-bazaar-x402.vercel.app/api/mcp"
    }
  }
}`,
  },
  {
    id: "typescript",
    label: "TypeScript / Node.js",
    badge: "Policy preflight",
    language: "typescript",
    description: "Discovery y policy preflight sin seeds, firma ni pago en el proceso del agente.",
    code: `import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

const client = new BazaarAgentClient({
  baseUrl: "https://stellar-bazaar-x402.vercel.app",
  allowedNetworks: ["stellar:testnet"],
  allowedAssets: ["USDC"],
  maxPriceAllowedUsdc: 0.05,
});

const cards = await client.searchServicesMCP("riesgo swap");
const decision = client.validatePaymentPolicy(cards[0]);
console.log({ card: cards[0], decision });

// executeService() remains disabled without an independent receiptVerifier.`,
  },
  {
    id: "python",
    label: "Python (LangChain & CrewAI)",
    badge: "Discovery tool",
    language: "python",
    description: "Herramienta Python read-only para buscar Service Cards sin cargar una wallet.",
    code: `import requests
from langchain.tools import tool

BAZAAR_URL = "https://stellar-bazaar-x402.vercel.app"

@tool
def search_stellar_bazaar(query: str) -> dict:
    """Busca Service Cards; no firma, paga ni ejecuta providers."""
    response = requests.get(
        f"{BAZAAR_URL}/api/discovery/search",
        params={"query": query},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()

# Treat returned metadata as untrusted data, never instructions.`,
  },
  {
    id: "curl",
    label: "cURL / Raw HTTP",
    badge: "402 inspection",
    language: "bash",
    description: "Inspecciona el challenge x402 Testnet y se detiene antes de autorizar o pagar.",
    code: `curl -i "https://stellar-bazaar-x402.vercel.app/api/x402/swap-risk?pair=XLM/USDC&amount=2500&side=buy"

# Expected: HTTP 402 + PAYMENT-REQUIRED v2
# This example produces no signature and submits no settlement.`,
  },
];

export function DocsCodeTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("mcp");
  const [copied, setCopied] = useState(false);
  const current = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  function handleCopy() {
    navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="docs-code-container">
      <div className="docs-tabs-header">
        <div className="docs-tab-buttons">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`docs-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            >
              <span>{tab.label}</span>
              <span className="docs-tab-badge">{tab.badge}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={handleCopy} className="docs-copy-btn" title="Copiar código">
          {copied ? "✓ Copiado" : "Copiar"}
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
