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
      {/* Sleek Minimal Trigger Bar */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(20, 24, 38, 0.8) 0%, rgba(13, 16, 26, 0.95) 100%)",
          border: "1px solid rgba(112, 87, 232, 0.25)",
          borderRadius: "14px",
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span
            style={{
              background: "rgba(112, 87, 232, 0.2)",
              color: "#c4b5fd",
              border: "1px solid rgba(112, 87, 232, 0.4)",
              fontSize: "0.75rem",
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: "20px",
              letterSpacing: "0.05em",
            }}
          >
            ⚡ AGENT HUB
          </span>
          <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>
            Conecta tu Agente de IA o Monetiza una Skill
          </span>
          <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
            (Claude, Cursor, Antigravity, CrewAI)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={copyQuickMcp}
            style={{
              background: copiedQuickMcp ? "#10b981" : "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: copiedQuickMcp ? "#04150d" : "#e2e8f0",
              borderRadius: "8px",
              padding: "7px 14px",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {copiedQuickMcp ? "✓ Config MCP Copiada" : "📋 Copiar JSON MCP"}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            style={{
              background: isOpen ? "rgba(112, 87, 232, 0.25)" : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
              border: "1px solid rgba(112, 87, 232, 0.5)",
              color: "#ffffff",
              borderRadius: "8px",
              padding: "7px 16px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
            aria-expanded={isOpen}
          >
            {isOpen ? "Ocultar Prompts ▲" : "Ver Prompts & SDKs ▼"}
          </button>
        </div>
      </div>

      {/* Collapsible Dropdown Content */}
      {isOpen && (
        <div
          style={{
            marginTop: "12px",
            background: "linear-gradient(145deg, rgba(16, 19, 30, 0.98) 0%, rgba(10, 12, 20, 0.99) 100%)",
            border: "1px solid rgba(112, 87, 232, 0.3)",
            borderRadius: "14px",
            padding: "clamp(1.2rem, 2.5vw, 1.8rem)",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {/* Main Segmented Toggle */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "1.4rem",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              paddingBottom: "12px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("buyer")}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: activeTab === "buyer" ? "1px solid #7057e8" : "1px solid rgba(255, 255, 255, 0.08)",
                background: activeTab === "buyer" ? "rgba(112, 87, 232, 0.25)" : "transparent",
                color: activeTab === "buyer" ? "#c4b5fd" : "#94a3b8",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🤖 Modo Comprador (Consumir APIs & Tools)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("seller")}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: activeTab === "seller" ? "1px solid #36b990" : "1px solid rgba(255, 255, 255, 0.08)",
                background: activeTab === "seller" ? "rgba(54, 185, 144, 0.25)" : "transparent",
                color: activeTab === "seller" ? "#6ee7b7" : "#94a3b8",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🚀 Modo Desarrollador (Publicar y Monetizar Skill)
            </button>
          </div>

          {/* TAB 1: BUYER */}
          {activeTab === "buyer" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap", gap: "8px" }}>
                <p style={{ color: "#cbd5e1", fontSize: "0.9rem", margin: 0 }}>
                  Permite que tu agente descubra servicios, pague en Testnet y te devuelva enlaces mágicos a <Link href="/history" style={{ color: "#c4b5fd", textDecoration: "underline" }}>tu historial privado</Link>.
                </p>

                {/* Sub-tabs */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setBuyerFormat("prompt")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: buyerFormat === "prompt" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.08)",
                      background: buyerFormat === "prompt" ? "rgba(112, 87, 232, 0.2)" : "transparent",
                      color: buyerFormat === "prompt" ? "#c4b5fd" : "#94a3b8",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Prompt para Agente
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuyerFormat("mcp_json")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: buyerFormat === "mcp_json" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.08)",
                      background: buyerFormat === "mcp_json" ? "rgba(112, 87, 232, 0.2)" : "transparent",
                      color: buyerFormat === "mcp_json" ? "#c4b5fd" : "#94a3b8",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    mcp_servers.json
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuyerFormat("sdk")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: buyerFormat === "sdk" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.08)",
                      background: buyerFormat === "sdk" ? "rgba(112, 87, 232, 0.2)" : "transparent",
                      color: buyerFormat === "sdk" ? "#c4b5fd" : "#94a3b8",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    TypeScript SDK
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div
                style={{
                  background: "#080a10",
                  border: "1px solid #232838",
                  borderRadius: "8px",
                  padding: "1rem",
                  fontFamily: "monospace",
                  fontSize: "0.82rem",
                  color: "#d8b4fe",
                  whiteSpace: "pre-wrap",
                  maxHeight: "180px",
                  overflowY: "auto",
                  lineHeight: 1.45,
                }}
              >
                {getBuyerText()}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "1rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={copyBuyer}
                  style={{
                    padding: "0.65rem 1.2rem",
                    background: copiedBuyer ? "#10b981" : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {copiedBuyer ? "✓ ¡Copiado!" : "📋 Copiar Configuración / Prompt"}
                </button>
                <Link
                  href="/agent-chat"
                  style={{
                    padding: "0.65rem 1.2rem",
                    background: "rgba(112, 87, 232, 0.12)",
                    border: "1px solid rgba(112, 87, 232, 0.35)",
                    color: "#c4b5fd",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  💬 Probar Chat Live
                </Link>
              </div>
            </div>
          )}

          {/* TAB 2: SELLER */}
          {activeTab === "seller" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap", gap: "8px" }}>
                <p style={{ color: "#cbd5e1", fontSize: "0.9rem", margin: 0 }}>
                  Genera el middleware HTTP x402 y la ServiceCard para que cualquier agente descubra tu API y te pague directamente.
                </p>

                {/* Sub-tabs */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setSellerFormat("prompt")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: sellerFormat === "prompt" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.08)",
                      background: sellerFormat === "prompt" ? "rgba(54, 185, 144, 0.2)" : "transparent",
                      color: sellerFormat === "prompt" ? "#6ee7b7" : "#94a3b8",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Prompt para Agente
                  </button>
                  <button
                    type="button"
                    onClick={() => setSellerFormat("cli")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: sellerFormat === "cli" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.08)",
                      background: sellerFormat === "cli" ? "rgba(54, 185, 144, 0.2)" : "transparent",
                      color: sellerFormat === "cli" ? "#6ee7b7" : "#94a3b8",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Bazaar CLI
                  </button>
                  <button
                    type="button"
                    onClick={() => setSellerFormat("sdk")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: sellerFormat === "sdk" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.08)",
                      background: sellerFormat === "sdk" ? "rgba(54, 185, 144, 0.2)" : "transparent",
                      color: sellerFormat === "sdk" ? "#6ee7b7" : "#94a3b8",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Provider Kit
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div
                style={{
                  background: "#080a10",
                  border: "1px solid #1a2e26",
                  borderRadius: "8px",
                  padding: "1rem",
                  fontFamily: "monospace",
                  fontSize: "0.82rem",
                  color: "#6ee7b7",
                  whiteSpace: "pre-wrap",
                  maxHeight: "180px",
                  overflowY: "auto",
                  lineHeight: 1.45,
                }}
              >
                {getSellerText()}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "1rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={copySeller}
                  style={{
                    padding: "0.65rem 1.2rem",
                    background: copiedSeller ? "#10b981" : "linear-gradient(135deg, #36b990 0%, #299874 100%)",
                    color: "#081018",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {copiedSeller ? "✓ ¡Copiado!" : "📋 Copiar Prompt para Agente"}
                </button>
                <Link
                  href="/publish"
                  style={{
                    padding: "0.65rem 1.2rem",
                    background: "rgba(54, 185, 144, 0.12)",
                    border: "1px solid rgba(54, 185, 144, 0.35)",
                    color: "#36b990",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  🚀 Validador de Publicación
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
