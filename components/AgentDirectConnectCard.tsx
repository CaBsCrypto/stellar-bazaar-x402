"use client";

import { useState } from "react";
import Link from "next/link";

type BuyerFormat = "prompt" | "mcp_json" | "sdk";
type SellerFormat = "prompt" | "cli" | "sdk";
type SellerExample = "scriptwriter" | "auditor" | "oracle" | "custom";
type ActiveTab = "buyer" | "seller";

export function AgentDirectConnectCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("buyer");
  const [buyerFormat, setBuyerFormat] = useState<BuyerFormat>("prompt");
  const [sellerFormat, setSellerFormat] = useState<SellerFormat>("prompt");
  const [sellerExample, setSellerExample] = useState<SellerExample>("scriptwriter");
  const [copiedBuyer, setCopiedBuyer] = useState(false);
  const [copiedSeller, setCopiedSeller] = useState(false);
  const [copiedQuickMcp, setCopiedQuickMcp] = useState(false);

  // Quick MCP Config
  const quickMcpJson = `{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "https://bazaar.browns.studio/api/mcp"
    }
  }
}`;

  // Buyer Snippets
  const buyerPrompt = `Actúa como Agente Comprador de IA y conéctate a Stellar Bazaar x402:
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp
👉 Especificación: https://bazaar.browns.studio/llms.txt

Tus tareas:
1. Descubre herramientas llamando a 'search_services' (auditorías web, riesgo DeFi, oráculos).
2. Valida la ServiceCard y ejecuta pagos en USDC sobre Stellar Testnet.
3. Devuelve al usuario humano su enlace mágico con token hash (/history#token=bz_read_...) para acceder a sus reportes en Cloudflare R2.`;

  const buyerMcpJson = quickMcpJson;

  const buyerSdkCode = `import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

const agent = new BazaarAgentClient({
  baseUrl: "https://bazaar.browns.studio",
  maxPriceAllowedUsdc: 0.10,
  allowedNetworks: ["stellar:testnet"],
});

// 1. Descubre servicios vía MCP
const services = await agent.searchServicesREST("video");

// 2. Genera enlace mágico de historial para el humano
const historyUrl = agent.getHumanHistoryLink();
console.log("Historial privado:", historyUrl);`;

  // Seller Prompt Examples
  const sellerPrompts: Record<SellerExample, string> = {
    scriptwriter: `Actúa como Agente Desarrollador y crea la Skill 'AI Video Scriptwriter' para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp
👉 Kit: @stellar-bazaar/provider-kit (o npm run bazaar-cli)

🎯 SKILL: "AI Video Scriptwriter & Creative Director"
- Rol: Guionista profesional de videos cortos (YouTube Shorts, TikTok, Reels).
- Inputs: 'topic' (string), 'durationSeconds' (number), 'tone' (string).
- Precio: 0.02 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint HTTP con middleware x402 que genera el guion estructurado por escenas y un visor 'teleprompter.html' bajo el estándar 'bazaarDelivery' (con hashes SHA-256).
2. 'service-card.json': Ficha oficial de catálogo validada para indexación MCP.`,

    auditor: `Actúa como Agente Desarrollador y crea la Skill 'Soroban Smart Contract Auditor' para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp

🎯 SKILL: "Soroban Smart Contract Safety Auditor"
- Rol: Auditor de vulnerabilidades estáticas en contratos Soroban/Rust.
- Inputs: 'contractAddress' (string), 'sourceCode' (string opcional).
- Precio: 0.05 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint x402 que analiza seguridad y emite 'audit-report.html' bajo el estándar 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial del catálogo validada para indexación MCP.`,

    oracle: `Actúa como Agente Desarrollador y crea la Skill 'DeFi Arbitrage & Oracle' para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp

🎯 SKILL: "Stellar DEX Arbitrage & Slippage Oracle"
- Rol: Oráculo de cotizaciones y cálculo de slippage entre pares XLM/USDC/EURC.
- Inputs: 'pair' (string), 'amount' (number), 'side' (string: buy/sell).
- Precio: 0.01 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint x402 con cotizaciones en tiempo real y envelope 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial de catálogo validada para indexación MCP.`,

    custom: `Actúa como Agente Desarrollador y crea una Skill personalizada para Stellar Bazaar x402:
👉 Especificación: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp

🎯 DATOS DE LA SKILL:
- Nombre: "[Nombre de tu Servicio]"
- Descripción: "[Qué hace la herramienta]"
- Inputs: "[parámetros requeridos]"
- Precio: "[Monto]" USDC en Stellar Testnet
- Wallet de Cobro: "[Tu wallet pública Stellar G...]"

Tus 2 entregables:
1. 'server.ts': Endpoint HTTP con middleware x402 y estándar 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial del catálogo validada para indexación MCP.`,
  };

  const sellerCliCode = `# 1. Inicializar plantilla de servicio
npm run bazaar-cli init mi-servicio.json

# 2. Validar conformidad con el estándar del Bazaar
npm run bazaar-cli validate mi-servicio.json`;

  const sellerSdkCode = `import { generateCanonicalServiceCard, createDeliverableBundle } from "@/lib/provider-kit";

// 1. Genera la ServiceCard oficial
const card = generateCanonicalServiceCard({
  id: "mi-servicio-ai",
  name: "Mi Servicio AI",
  description: "Microservicio de inferencia con cobro x402",
  tags: ["ai", "analysis"],
  pricing: { amountUsdc: "0.05", destinationAddress: "G..." },
  endpointUrl: "https://mi-api.com/x402/run",
  input: [{ name: "prompt", type: "string", required: true }],
  provider: { name: "Mi Org" }
});

// 2. Empaqueta el entregable con hashes SHA-256
const envelope = createDeliverableBundle(card.id, { output: "OK" }, files);`;

  const getBuyerText = () => {
    if (buyerFormat === "prompt") return buyerPrompt;
    if (buyerFormat === "mcp_json") return buyerMcpJson;
    return buyerSdkCode;
  };

  const getSellerText = () => {
    if (sellerFormat === "prompt") return sellerPrompts[sellerExample];
    if (sellerFormat === "cli") return sellerCliCode;
    return sellerSdkCode;
  };

  const copyQuickMcp = async () => {
    try {
      await navigator.clipboard.writeText(quickMcpJson);
      setCopiedQuickMcp(true);
      setTimeout(() => setCopiedQuickMcp(false), 2500);
    } catch {}
  };

  const copyBuyer = async () => {
    try {
      await navigator.clipboard.writeText(getBuyerText());
      setCopiedBuyer(true);
      setTimeout(() => setCopiedBuyer(false), 2500);
    } catch {}
  };

  const copySeller = async () => {
    try {
      await navigator.clipboard.writeText(getSellerText());
      setCopiedSeller(true);
      setTimeout(() => setCopiedSeller(false), 2500);
    } catch {}
  };

  return (
    <section className="shell agent-connect-dropdown-section" style={{ margin: "1.5rem auto 2.5rem auto" }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .agent-hub-trigger {
          background: linear-gradient(135deg, rgba(20, 24, 38, 0.8) 0%, rgba(13, 16, 26, 0.95) 100%);
          border: 1px solid rgba(112, 87, 232, 0.25);
          border-radius: 14px;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        }
        .agent-hub-label-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .agent-hub-label-group .hub-subtitle {
          display: none;
        }
        .agent-hub-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .agent-hub-toggle-btn {
          border: 1px solid rgba(112, 87, 232, 0.5);
          color: #ffffff;
          border-radius: 8px;
          padding: 7px 14px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .agent-hub-mcp-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e2e8f0;
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .agent-hub-dropdown {
          margin-top: 10px;
          background: linear-gradient(145deg, rgba(16, 19, 30, 0.98) 0%, rgba(10, 12, 20, 0.99) 100%);
          border: 1px solid rgba(112, 87, 232, 0.3);
          border-radius: 14px;
          padding: clamp(1rem, 3vw, 1.6rem);
          animation: fadeIn 0.2s ease-out;
        }
        .agent-hub-main-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 1.2rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 12px;
        }
        .agent-hub-main-tab {
          flex: 1;
          padding: 8px 10px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.82rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          text-align: center;
        }
        .agent-hub-sub-tabs {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 0.6rem;
        }
        .agent-hub-code-box {
          border-radius: 8px;
          padding: 0.9rem 1rem;
          font-family: monospace;
          font-size: clamp(0.72rem, 2.5vw, 0.82rem);
          white-space: pre-wrap;
          max-height: 180px;
          overflow-y: auto;
          line-height: 1.5;
          word-break: break-word;
          margin-top: 0.8rem;
        }
        .agent-hub-cta-row {
          display: flex;
          gap: 8px;
          margin-top: 1rem;
          flex-wrap: wrap;
        }
        .agent-hub-cta-row .primary-cta {
          flex: 1;
          min-width: 0;
          padding: 0.7rem 1rem;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .agent-hub-cta-row .secondary-cta {
          padding: 0.7rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.82rem;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          white-space: nowrap;
        }
        @media (min-width: 560px) {
          .agent-hub-label-group .hub-subtitle {
            display: inline;
          }
        }
      `}</style>

      {/* Trigger Bar */}
      <div className="agent-hub-trigger">
        <div className="agent-hub-label-group">
          <span
            style={{
              background: "rgba(112, 87, 232, 0.2)",
              color: "#c4b5fd",
              border: "1px solid rgba(112, 87, 232, 0.4)",
              fontSize: "0.72rem",
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: "20px",
              letterSpacing: "0.05em",
              flexShrink: 0,
            }}
          >
            ⚡ AGENT HUB
          </span>
          <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#f8fafc" }}>
            Conecta o Monetiza una Skill
          </span>
          <span className="hub-subtitle" style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
            (Claude, Cursor, CrewAI…)
          </span>
        </div>

        <div className="agent-hub-actions">
          <button
            type="button"
            onClick={copyQuickMcp}
            className="agent-hub-mcp-btn"
            style={{
              background: copiedQuickMcp ? "#10b981" : "rgba(255, 255, 255, 0.08)",
              color: copiedQuickMcp ? "#04150d" : "#e2e8f0",
            }}
          >
            {copiedQuickMcp ? "✓ Copiado" : "📋 MCP"}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="agent-hub-toggle-btn"
            style={{
              background: isOpen
                ? "rgba(112, 87, 232, 0.25)"
                : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
            }}
            aria-expanded={isOpen}
          >
            {isOpen ? "Ocultar ▲" : "Prompts & SDKs ▼"}
          </button>
        </div>
      </div>

      {/* Collapsible Dropdown */}
      {isOpen && (
        <div className="agent-hub-dropdown">
          {/* Main tabs */}
          <div className="agent-hub-main-tabs">
            <button
              type="button"
              onClick={() => setActiveTab("buyer")}
              className="agent-hub-main-tab"
              style={{
                border: activeTab === "buyer" ? "1px solid #7057e8" : "1px solid rgba(255, 255, 255, 0.08)",
                background: activeTab === "buyer" ? "rgba(112, 87, 232, 0.25)" : "transparent",
                color: activeTab === "buyer" ? "#c4b5fd" : "#94a3b8",
              }}
            >
              🤖 Comprador
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("seller")}
              className="agent-hub-main-tab"
              style={{
                border: activeTab === "seller" ? "1px solid #36b990" : "1px solid rgba(255, 255, 255, 0.08)",
                background: activeTab === "seller" ? "rgba(54, 185, 144, 0.25)" : "transparent",
                color: activeTab === "seller" ? "#6ee7b7" : "#94a3b8",
              }}
            >
              🚀 Desarrollador
            </button>
          </div>

          {/* TAB 1: BUYER */}
          {activeTab === "buyer" && (
            <div>
              <p style={{ color: "#cbd5e1", fontSize: "0.88rem", margin: "0 0 0.6rem" }}>
                Permite que tu agente descubra servicios, pague en Testnet y te devuelva enlaces a{" "}
                <Link href="/history" style={{ color: "#c4b5fd", textDecoration: "underline" }}>tu historial privado</Link>.
              </p>

              <div className="agent-hub-sub-tabs">
                {(["prompt", "mcp_json", "sdk"] as BuyerFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setBuyerFormat(fmt)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: buyerFormat === fmt ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.08)",
                      background: buyerFormat === fmt ? "rgba(112, 87, 232, 0.2)" : "transparent",
                      color: buyerFormat === fmt ? "#c4b5fd" : "#94a3b8",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {fmt === "prompt" ? "Prompt" : fmt === "mcp_json" ? "MCP JSON" : "TS SDK"}
                  </button>
                ))}
              </div>

              <div
                className="agent-hub-code-box"
                style={{
                  background: "#080a10",
                  border: "1px solid #232838",
                  color: "#d8b4fe",
                }}
              >
                {getBuyerText()}
              </div>

              <div className="agent-hub-cta-row">
                <button
                  type="button"
                  onClick={copyBuyer}
                  className="primary-cta"
                  style={{
                    background: copiedBuyer ? "#10b981" : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
                    color: "#ffffff",
                  }}
                >
                  {copiedBuyer ? "✓ ¡Copiado!" : "📋 Copiar"}
                </button>
                <Link
                  href="/agent-chat"
                  className="secondary-cta"
                  style={{
                    background: "rgba(112, 87, 232, 0.12)",
                    border: "1px solid rgba(112, 87, 232, 0.35)",
                    color: "#c4b5fd",
                  }}
                >
                  💬 Chat Live
                </Link>
              </div>
            </div>
          )}

          {/* TAB 2: SELLER */}
          {activeTab === "seller" && (
            <div>
              <p style={{ color: "#cbd5e1", fontSize: "0.88rem", margin: "0 0 0.6rem" }}>
                Genera el middleware HTTP x402 y la ServiceCard para que cualquier agente descubra tu API y te pague directamente.
              </p>

              <div className="agent-hub-sub-tabs">
                {(["prompt", "cli", "sdk"] as SellerFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setSellerFormat(fmt)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: sellerFormat === fmt ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.08)",
                      background: sellerFormat === fmt ? "rgba(54, 185, 144, 0.2)" : "transparent",
                      color: sellerFormat === fmt ? "#6ee7b7" : "#94a3b8",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {fmt === "prompt" ? "Prompt" : fmt === "cli" ? "Bazaar CLI" : "Provider Kit"}
                  </button>
                ))}
              </div>

              {sellerFormat === "prompt" && (
                <div className="agent-hub-sub-tabs" style={{ marginTop: "0.5rem" }}>
                  {(["scriptwriter", "auditor", "oracle", "custom"] as SellerExample[]).map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setSellerExample(ex)}
                      style={{
                        padding: "3px 9px",
                        borderRadius: "6px",
                        border: sellerExample === ex ? "1px solid rgba(54,185,144,0.6)" : "1px solid rgba(255,255,255,0.06)",
                        background: sellerExample === ex ? "rgba(54,185,144,0.12)" : "transparent",
                        color: sellerExample === ex ? "#6ee7b7" : "#64748b",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {ex === "scriptwriter" ? "🎬 Script" : ex === "auditor" ? "🔐 Auditor" : ex === "oracle" ? "📊 Oráculo" : "✏️ Custom"}
                    </button>
                  ))}
                </div>
              )}

              <div
                className="agent-hub-code-box"
                style={{
                  background: "#080a10",
                  border: "1px solid #1a2e26",
                  color: "#6ee7b7",
                }}
              >
                {getSellerText()}
              </div>

              <div className="agent-hub-cta-row">
                <button
                  type="button"
                  onClick={copySeller}
                  className="primary-cta"
                  style={{
                    background: copiedSeller ? "#10b981" : "linear-gradient(135deg, #36b990 0%, #299874 100%)",
                    color: "#081018",
                  }}
                >
                  {copiedSeller ? "✓ ¡Copiado!" : "📋 Copiar Prompt"}
                </button>
                <Link
                  href="/publish"
                  className="secondary-cta"
                  style={{
                    background: "rgba(54, 185, 144, 0.12)",
                    border: "1px solid rgba(54, 185, 144, 0.35)",
                    color: "#36b990",
                  }}
                >
                  🚀 /publish
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
