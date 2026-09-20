"use client";

import { useState } from "react";
import Link from "next/link";

type BuyerFormat = "prompt" | "mcp_json" | "sdk";
type SellerFormat = "prompt" | "cli" | "sdk";
type SellerExample = "scriptwriter" | "auditor" | "oracle" | "custom";

export function AgentDirectConnectCard() {
  const [buyerFormat, setBuyerFormat] = useState<BuyerFormat>("prompt");
  const [sellerFormat, setSellerFormat] = useState<SellerFormat>("prompt");
  const [sellerExample, setSellerExample] = useState<SellerExample>("scriptwriter");
  const [copiedBuyer, setCopiedBuyer] = useState(false);
  const [copiedSeller, setCopiedSeller] = useState(false);

  // Buyer Snippets
  const buyerPrompt = `Actúa como Agente Comprador de IA y conéctate a Stellar Bazaar x402:
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp
👉 Especificación: https://stellar-bazaar-x402.vercel.app/llms.txt

Tus tareas:
1. Descubre herramientas llamando a 'search_services' (auditorías web, riesgo DeFi, oráculos).
2. Valida la ServiceCard y ejecuta pagos en USDC sobre Stellar Testnet.
3. Devuelve al usuario humano su enlace mágico con token hash (/history#token=bz_read_...) para acceder a sus reportes en Cloudflare R2.`;

  const buyerMcpJson = `{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "https://stellar-bazaar-x402.vercel.app/api/mcp",
      "transport": "sse"
    }
  }
}`;

  const buyerSdkCode = `import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

const agent = new BazaarAgentClient({
  baseUrl: "https://stellar-bazaar-x402.vercel.app",
  maxPriceAllowedUsdc: 0.10,
  allowedNetworks: ["stellar:testnet"],
});

// 1. Descubre servicios vía MCP
const services = await agent.searchServicesREST("website");

// 2. Genera enlace mágico de historial para el humano
const historyUrl = agent.getHumanHistoryLink();
console.log("Historial privado:", historyUrl);`;

  // Seller Prompt Examples
  const sellerPrompts: Record<SellerExample, string> = {
    scriptwriter: `Actúa como Agente Desarrollador y crea la Skill 'AI Video Scriptwriter' para Stellar Bazaar x402:
👉 Especificación: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp
👉 Kit: @stellar-bazaar/provider-kit (o npm run bazaar-cli)

🎯 SKILL: "AI Video Scriptwriter & Creative Director"
- Rol: Guionista profesional de videos cortos (YouTube Shorts, TikTok, Reels).
- Inputs: 'topic' (string), 'durationSeconds' (number), 'tone' (string).
- Precio: 0.02 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint HTTP con middleware x402 que genera el guion estructurado por escenas y un visor 'teleprompter.html' bajo el estándar 'bazaarDelivery' (con hashes SHA-256).
2. 'service-card.json': Ficha oficial de catálogo validada para indexación MCP.
(El Smart Contract FeeSplitRouter distribuirá automáticamente 97% a nuestra wallet y 3% a la tesorería del Bazaar).`,

    auditor: `Actúa como Agente Desarrollador y crea la Skill 'Soroban Smart Contract Auditor' para Stellar Bazaar x402:
👉 Especificación: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp

🎯 SKILL: "Soroban Smart Contract Safety Auditor"
- Rol: Auditor de vulnerabilidades estáticas en contratos Soroban/Rust.
- Inputs: 'contractAddress' (string), 'sourceCode' (string opcional).
- Precio: 0.05 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint x402 que analiza seguridad y emite 'audit-report.html' bajo el estándar 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial del catálogo validada para indexación MCP.`,

    oracle: `Actúa como Agente Desarrollador y crea la Skill 'DeFi Arbitrage & Oracle' para Stellar Bazaar x402:
👉 Especificación: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp

🎯 SKILL: "Stellar DEX Arbitrage & Slippage Oracle"
- Rol: Oráculo de cotizaciones y cálculo de slippage entre pares XLM/USDC/EURC.
- Inputs: 'pair' (string), 'amount' (number), 'side' (string: buy/sell).
- Precio: 0.01 USDC en Stellar Testnet.
- Wallet de Cobro: [Tu clave pública Stellar G...]

Tus 2 entregables:
1. 'server.ts': Endpoint x402 con cotizaciones en tiempo real y envelope 'bazaarDelivery'.
2. 'service-card.json': Ficha oficial de catálogo validada para indexación MCP.`,

    custom: `Actúa como Agente Desarrollador y crea una Skill personalizada para Stellar Bazaar x402:
👉 Especificación: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp

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
npm run bazaar-cli validate mi-servicio.json

# 3. Simular reparto atómico de comisiones
npm run bazaar-cli split 0.05`;

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
    <section className="shell agent-connect-section" style={{ margin: "3rem auto" }}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <span
          style={{
            fontSize: "0.78rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontWeight: 700,
            padding: "4px 14px",
            borderRadius: "20px",
            background: "rgba(138, 180, 248, 0.1)",
            color: "#8ab4f8",
            border: "1px solid rgba(138, 180, 248, 0.25)",
            display: "inline-block",
            marginBottom: "0.6rem",
          }}
        >
          AI AGENT INTEGRATION HUB · MCP & x402 PROTOCOL
        </span>
        <h2 style={{ fontSize: "2.2rem", fontWeight: 800, margin: "0.2rem 0 0.5rem 0", letterSpacing: "-0.02em" }}>
          Conecta a tu Agente en un Solo Clic
        </h2>
        <p style={{ color: "#94a3b8", maxWidth: "680px", margin: "0 auto", fontSize: "1rem", lineHeight: 1.5 }}>
          Permite que tu agente de IA (Cursor, Claude, Copilot, ChatGPT, Antigravity) descubra y consuma servicios, o construya y monetice nuevas Skills con reparto automático de comisiones.
        </p>
      </div>

      {/* Dual Side-by-Side Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
          gap: "1.8rem",
          alignItems: "stretch",
        }}
      >
        {/* BUYER CARD */}
        <div
          style={{
            background: "linear-gradient(145deg, rgba(20, 22, 36, 0.95) 0%, rgba(13, 15, 25, 0.98) 100%)",
            border: "1px solid rgba(112, 87, 232, 0.3)",
            borderRadius: "16px",
            padding: "1.8rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.3), 0 0 20px rgba(112, 87, 232, 0.06)",
            position: "relative",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <span
                style={{
                  background: "rgba(112, 87, 232, 0.15)",
                  color: "#c4b5fd",
                  border: "1px solid rgba(112, 87, 232, 0.3)",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🤖</span> MODO COMPRADOR
              </span>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Discovery MCP + x402</span>
            </div>

            <h3 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "#f8fafc" }}>
              Tu Agente como Cliente Autónomo
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.5, margin: "0 0 1.2rem 0" }}>
              Permite que tu agente descubra microservicios, liquide pagos en Stellar Testnet y te devuelva enlaces mágicos a tus reportes privados en Cloudflare R2.
            </p>

            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setBuyerFormat("prompt")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: buyerFormat === "prompt" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.08)",
                  background: buyerFormat === "prompt" ? "rgba(112, 87, 232, 0.2)" : "rgba(255,255,255,0.02)",
                  color: buyerFormat === "prompt" ? "#c4b5fd" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                1-Prompt de Agente
              </button>
              <button
                type="button"
                onClick={() => setBuyerFormat("mcp_json")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: buyerFormat === "mcp_json" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.08)",
                  background: buyerFormat === "mcp_json" ? "rgba(112, 87, 232, 0.2)" : "rgba(255,255,255,0.02)",
                  color: buyerFormat === "mcp_json" ? "#c4b5fd" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                claude_desktop_config.json
              </button>
              <button
                type="button"
                onClick={() => setBuyerFormat("sdk")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: buyerFormat === "sdk" ? "1px solid #7057e8" : "1px solid rgba(255,255,255,0.08)",
                  background: buyerFormat === "sdk" ? "rgba(112, 87, 232, 0.2)" : "rgba(255,255,255,0.02)",
                  color: buyerFormat === "sdk" ? "#c4b5fd" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                TypeScript SDK
              </button>
            </div>

            {/* Code Box */}
            <div
              style={{
                background: "#080a10",
                border: "1px solid #232838",
                borderRadius: "8px",
                padding: "0.9rem",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: "#d8b4fe",
                whiteSpace: "pre-wrap",
                maxHeight: "180px",
                overflowY: "auto",
                lineHeight: 1.45,
                position: "relative",
              }}
            >
              {getBuyerText()}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.8rem", marginTop: "1.2rem" }}>
            <button
              type="button"
              onClick={copyBuyer}
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                background: copiedBuyer ? "#10b981" : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(112, 87, 232, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s",
              }}
            >
              {copiedBuyer ? "✓ ¡Copiado!" : "📋 Copiar Configuración / Prompt"}
            </button>
            <Link
              href="/agent-chat"
              style={{
                padding: "0.75rem 1rem",
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

        {/* SELLER CARD */}
        <div
          style={{
            background: "linear-gradient(145deg, rgba(16, 28, 26, 0.95) 0%, rgba(10, 18, 16, 0.98) 100%)",
            border: "1px solid rgba(54, 185, 144, 0.3)",
            borderRadius: "16px",
            padding: "1.8rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.3), 0 0 20px rgba(54, 185, 144, 0.06)",
            position: "relative",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <span
                style={{
                  background: "rgba(54, 185, 144, 0.15)",
                  color: "#36b990",
                  border: "1px solid rgba(54, 185, 144, 0.3)",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>👨‍💻</span> MODO VENDEDOR / SKILL CREATOR
              </span>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>FeeSplitRouter (97/3 Split)</span>
            </div>

            <h3 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "#f8fafc" }}>
              Monetiza tu API o Skill de IA
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.5, margin: "0 0 1.2rem 0" }}>
              Empaqueta cualquier endpoint bajo el estándar del Bazaar, valida la ServiceCard oficial y recibe pagos en USDC con liquidación automática on-chain.
            </p>

            {/* Mode selection tabs */}
            <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSellerFormat("prompt")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: sellerFormat === "prompt" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.08)",
                  background: sellerFormat === "prompt" ? "rgba(54, 185, 144, 0.2)" : "rgba(255,255,255,0.02)",
                  color: sellerFormat === "prompt" ? "#36b990" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                1-Prompt de Agente
              </button>
              <button
                type="button"
                onClick={() => setSellerFormat("cli")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: sellerFormat === "cli" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.08)",
                  background: sellerFormat === "cli" ? "rgba(54, 185, 144, 0.2)" : "rgba(255,255,255,0.02)",
                  color: sellerFormat === "cli" ? "#36b990" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                bazaar-cli Tooling
              </button>
              <button
                type="button"
                onClick={() => setSellerFormat("sdk")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: sellerFormat === "sdk" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.08)",
                  background: sellerFormat === "sdk" ? "rgba(54, 185, 144, 0.2)" : "rgba(255,255,255,0.02)",
                  color: sellerFormat === "sdk" ? "#36b990" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Provider Kit SDK
              </button>
            </div>

            {/* Example selector pills (when in prompt mode) */}
            {sellerFormat === "prompt" && (
              <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setSellerExample("scriptwriter")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: sellerExample === "scriptwriter" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.06)",
                    background: sellerExample === "scriptwriter" ? "rgba(54, 185, 144, 0.15)" : "transparent",
                    color: sellerExample === "scriptwriter" ? "#6ee7b7" : "#94a3b8",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                  }}
                >
                  🎬 Guionista de Videos
                </button>
                <button
                  type="button"
                  onClick={() => setSellerExample("auditor")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: sellerExample === "auditor" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.06)",
                    background: sellerExample === "auditor" ? "rgba(54, 185, 144, 0.15)" : "transparent",
                    color: sellerExample === "auditor" ? "#6ee7b7" : "#94a3b8",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                  }}
                >
                  🔍 Auditor Soroban
                </button>
                <button
                  type="button"
                  onClick={() => setSellerExample("oracle")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: sellerExample === "oracle" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.06)",
                    background: sellerExample === "oracle" ? "rgba(54, 185, 144, 0.15)" : "transparent",
                    color: sellerExample === "oracle" ? "#6ee7b7" : "#94a3b8",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                  }}
                >
                  📊 Oráculo DeFi
                </button>
                <button
                  type="button"
                  onClick={() => setSellerExample("custom")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: sellerExample === "custom" ? "1px solid #36b990" : "1px solid rgba(255,255,255,0.06)",
                    background: sellerExample === "custom" ? "rgba(54, 185, 144, 0.15)" : "transparent",
                    color: sellerExample === "custom" ? "#6ee7b7" : "#94a3b8",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                  }}
                >
                  ⚙️ Plantilla Personalizada
                </button>
              </div>
            )}

            {/* Code Box */}
            <div
              style={{
                background: "#080f0c",
                border: "1px solid #1a382e",
                borderRadius: "8px",
                padding: "0.9rem",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: "#6ee7b7",
                whiteSpace: "pre-wrap",
                maxHeight: "180px",
                overflowY: "auto",
                lineHeight: 1.45,
                position: "relative",
              }}
            >
              {getSellerText()}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.8rem", marginTop: "1.2rem" }}>
            <button
              type="button"
              onClick={copySeller}
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                background: copiedSeller ? "#10b981" : "linear-gradient(135deg, #36b990 0%, #299874 100%)",
                color: "#081018",
                border: "none",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(54, 185, 144, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s",
              }}
            >
              {copiedSeller ? "✓ ¡Copiado!" : "📋 Copiar Configuración / Prompt"}
            </button>
            <Link
              href="/publish"
              style={{
                padding: "0.75rem 1rem",
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
              🚀 Validador
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
