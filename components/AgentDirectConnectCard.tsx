"use client";

import { useState } from "react";
import Link from "next/link";

export function AgentDirectConnectCard() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"seller" | "buyer">("seller");

  const sellerPrompt = `Actúa como Agente Desarrollador y publica una nueva Skill / API monetizada en Stellar Bazaar x402:
👉 Especificación & Contexto: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp
👉 Kit & CLI: npm run bazaar-cli init / validate (o @stellar-bazaar/provider-kit)

Tus 3 pasos de integración:
1. Agrega el middleware HTTP 402 a nuestro endpoint para cobrar en USDC Testnet a nuestra wallet Stellar (G...).
2. Formatea la respuesta bajo el estándar 'bazaarDelivery' (con manifest, archivos de entrega y hashes SHA-256).
3. Genera y valida la ServiceCard oficial usando la herramienta MCP 'validate_service_card' o el validador en https://stellar-bazaar-x402.vercel.app/publish

El Smart Contract FeeSplitRouter distribuirá automáticamente el 97% a nuestra wallet y el 3% a la tesorería del Bazaar sin custodia. Entrégame el endpoint listo y la ServiceCard JSON validada.`;

  const buyerPrompt = `Actúa como Agente Comprador de IA y conéctate a Stellar Bazaar x402:
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp
👉 Especificación & Contexto: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Playground WebMCP: https://stellar-bazaar-x402.vercel.app/webmcp-playground

Tus 3 pasos de ejecución:
1. Descubre herramientas activas llamando a la tool MCP 'search_services' o 'list_services' (auditorías web, riesgo DeFi, oráculos).
2. Evalúa la ServiceCard contra tu presupuesto (ej. máx 0.05 USDC) y liquida el pago x402 en Stellar Testnet.
3. Tras la entrega privada, genera y entrega al usuario humano su enlace mágico directo con token hash zero-knowledge (/history#token=bz_read_...) para que acceda a su historial y reportes en Cloudflare R2 con un solo clic.

Comienza consultando los servicios disponibles en el catálogo.`;

  const currentPrompt = activeTab === "seller" ? sellerPrompt : buyerPrompt;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(currentPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
    }
  };

  return (
    <section className="shell agent-connect-section" style={{ margin: "2.5rem auto" }}>
      <div
        style={{
          background: "linear-gradient(135deg, rgba(20, 24, 38, 0.95) 0%, rgba(13, 15, 23, 0.98) 100%)",
          border: activeTab === "seller" ? "1px solid rgba(54, 185, 144, 0.35)" : "1px solid rgba(112, 87, 232, 0.35)",
          borderRadius: "16px",
          padding: "2rem",
          boxShadow: activeTab === "seller" 
            ? "0 12px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(54, 185, 144, 0.08)"
            : "0 12px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(112, 87, 232, 0.08)",
          position: "relative",
          overflow: "hidden",
          transition: "border 0.3s ease, box-shadow 0.3s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "3px",
            background: activeTab === "seller" 
              ? "linear-gradient(90deg, #36b990, #299874, #36b990)"
              : "linear-gradient(90deg, #7057e8, #9333ea, #7057e8)",
            transition: "background 0.3s ease",
          }}
        />

        {/* Mode Selector Tabs */}
        <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setActiveTab("seller")}
            style={{
              padding: "0.65rem 1.2rem",
              borderRadius: "10px",
              border: activeTab === "seller" ? "1px solid #36b990" : "1px solid rgba(255, 255, 255, 0.08)",
              background: activeTab === "seller" ? "rgba(54, 185, 144, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "seller" ? "#36b990" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s",
            }}
          >
            <span>👨‍💻</span> 1-Prompt VENDEDOR (Crear Skill & Monetizar con x402)
          </button>
          <button
            onClick={() => setActiveTab("buyer")}
            style={{
              padding: "0.65rem 1.2rem",
              borderRadius: "10px",
              border: activeTab === "buyer" ? "1px solid #7057e8" : "1px solid rgba(255, 255, 255, 0.08)",
              background: activeTab === "buyer" ? "rgba(112, 87, 232, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "buyer" ? "#c4b5fd" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s",
            }}
          >
            <span>🤖</span> 1-Prompt COMPRADOR (Discovery MCP + Pagos x402)
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem" }}>
          <div style={{ maxWidth: "660px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "20px",
                background: activeTab === "seller" ? "rgba(54, 185, 144, 0.15)" : "rgba(112, 87, 232, 0.15)",
                color: activeTab === "seller" ? "#36b990" : "#c4b5fd",
                fontSize: "0.8rem",
                fontWeight: 600,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                marginBottom: "0.8rem",
              }}
            >
              {activeTab === "seller" 
                ? "⚡ Onboarding de Skill / Proveedor (FeeSplitRouter On-Chain 97/3)" 
                : "⚡ Onboarding de Comprador (MCP Discovery + Magic Links R2)"}
            </span>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.2rem 0 0.6rem 0", color: "#f8fafc" }}>
              {activeTab === "seller" 
                ? "Dale a tu Agente un solo prompt para monetizar su Skill" 
                : "Dale a tu Agente un solo prompt para comprar en el Bazaar"}
            </h2>
            
            {activeTab === "seller" ? (
              <div style={{ color: "#94a3b8", fontSize: "0.92rem", lineHeight: 1.6, marginTop: "0.5rem" }}>
                <p style={{ margin: "0 0 0.8rem 0" }}>
                  Pega este prompt en tu agente (Cursor, Claude, ChatGPT, Antigravity) para que construya y registre automáticamente tu servicio:
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.8rem", marginBottom: "0.8rem" }}>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(54, 185, 144, 0.2)" }}>
                    <strong style={{ color: "#36b990", display: "block", fontSize: "0.85rem" }}>1. Estandarización Provider Kit</strong>
                    <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Genera la ServiceCard canónica y empaqueta entregables R2 con hashes SHA-256.</span>
                  </div>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(54, 185, 144, 0.2)" }}>
                    <strong style={{ color: "#36b990", display: "block", fontSize: "0.85rem" }}>2. Reparto Atómico Soroban</strong>
                    <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Cada micropago x402 liquida 97% a tu wallet y 3% a la tesorería de forma no-custodial.</span>
                  </div>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(54, 185, 144, 0.2)" }}>
                    <strong style={{ color: "#36b990", display: "block", fontSize: "0.85rem" }}>3. Indexación Global MCP</strong>
                    <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Tu herramienta queda disponible para ser descubierta y consumida por cualquier agente de IA.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: "0.92rem", lineHeight: 1.6, marginTop: "0.5rem" }}>
                <p style={{ margin: "0 0 0.8rem 0" }}>
                  Pega este prompt en tu agente para que busque, pague y te devuelva los reportes directamente:
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.8rem", marginBottom: "0.8rem" }}>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(112, 87, 232, 0.2)" }}>
                    <strong style={{ color: "#c4b5fd", display: "block", fontSize: "0.85rem" }}>1. Descubrimiento MCP & WebMCP</strong>
                    <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Tu agente consulta /api/mcp o navigator.modelContext para listar herramientas.</span>
                  </div>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(112, 87, 232, 0.2)" }}>
                    <strong style={{ color: "#c4b5fd", display: "block", fontSize: "0.85rem" }}>2. Pagos x402 en 4 Segundos</strong>
                    <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Liquida en USDC sobre Stellar Testnet respetando los límites de presupuesto.</span>
                  </div>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid rgba(112, 87, 232, 0.2)" }}>
                    <strong style={{ color: "#c4b5fd", display: "block", fontSize: "0.85rem" }}>3. Enlace Mágico Desbloqueado</strong>
                    <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>El agente te devuelve un enlace (/history#token=...) que abre tus reportes en R2 al instante.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minWidth: "240px" }}>
            <button
              onClick={copyPrompt}
              style={{
                background: copied 
                  ? "#36b990" 
                  : activeTab === "seller" 
                    ? "linear-gradient(135deg, #36b990 0%, #299874 100%)"
                    : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
                color: activeTab === "seller" ? "#081018" : "#ffffff",
                border: "none",
                borderRadius: "10px",
                padding: "0.85rem 1.4rem",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.2s ease",
                boxShadow: activeTab === "seller" 
                  ? "0 4px 14px rgba(54, 185, 144, 0.3)"
                  : "0 4px 14px rgba(112, 87, 232, 0.3)",
              }}
            >
              {copied ? "✓ ¡Prompt Copiado!" : `📋 Copiar Prompt (${activeTab === "seller" ? "Vendedor" : "Comprador"})`}
            </button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {activeTab === "seller" ? (
                <Link
                  href="/publish"
                  style={{
                    flex: 1,
                    textAlign: "center",
                    background: "rgba(54, 185, 144, 0.1)",
                    border: "1px solid rgba(54, 185, 144, 0.3)",
                    borderRadius: "8px",
                    padding: "0.5rem",
                    color: "#36b990",
                    fontSize: "0.8rem",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  🚀 Validador ↗
                </Link>
              ) : (
                <Link
                  href="/agent-chat"
                  style={{
                    flex: 1,
                    textAlign: "center",
                    background: "rgba(112, 87, 232, 0.1)",
                    border: "1px solid rgba(112, 87, 232, 0.3)",
                    borderRadius: "8px",
                    padding: "0.5rem",
                    color: "#c4b5fd",
                    fontSize: "0.8rem",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  💬 Probar Chat ↗
                </Link>
              )}
              <Link
                href="/webmcp-playground"
                style={{
                  flex: 1,
                  textAlign: "center",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "0.5rem",
                  color: "#cbd5e1",
                  fontSize: "0.8rem",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                🛠️ WebMCP ↗
              </Link>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "1.4rem",
            background: "#080a0f",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "1rem 1.2rem",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.82rem",
            color: activeTab === "seller" ? "#93c5fd" : "#d8b4fe",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {currentPrompt}
        </div>
      </div>
    </section>
  );
}
