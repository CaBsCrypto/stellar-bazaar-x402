"use client";

import { useState } from "react";
import Link from "next/link";

export function AgentDirectConnectCard() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"seller" | "buyer">("seller");

  const sellerPrompt = `Conecta nuestro servicio al marketplace de Stellar Bazaar x402:
👉 Contexto: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp

Tus 2 tareas:
1. Agrega a nuestro endpoint el middleware HTTP 402 para cobrar en USDC Testnet a nuestra wallet Stellar (G...).
2. Genera y valida nuestro manifest 'service-card.json' usando el validador en https://stellar-bazaar-x402.vercel.app/publish

Entrégame el endpoint listo y el JSON validado.`;

  const buyerPrompt = `Conéctate como Agente Comprador a Stellar Bazaar x402:
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp
👉 Contexto: https://stellar-bazaar-x402.vercel.app/llms.txt

Tus 2 tareas:
1. Consulta la lista de servicios con la tool 'list_services' o 'search_services'.
2. Invoca y liquida micropagos x402 en USDC Testnet usando tu wallet fondeada.

Comienza buscando servicios DeFi y Oráculos disponibles.`;

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
            <span>👨‍💻</span> Soy VENDEDOR (Quiero monetizar mi API)
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
            <span>🤖</span> Soy COMPRADOR (Quiero que mi Agente consuma)
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem" }}>
          <div style={{ maxWidth: "620px" }}>
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
                ? "⚡ Onboarding de Proveedor (99% Revenue Share)" 
                : "⚡ Onboarding de Comprador (Discovery + x402 Settlement)"}
            </span>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.2rem 0 0.6rem 0", color: "#f8fafc" }}>
              {activeTab === "seller" 
                ? "¿Quieres monetizar tu API o Agente en minutos?" 
                : "¿Quieres equipar a tu Agente con APIs y Oráculos?"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.95rem", lineHeight: 1.6, margin: 0 }}>
              {activeTab === "seller"
                ? "Copia este prompt y pégaselo a tu agente (Cursor, Claude o tu bot). Implementará el cobro HTTP 402 hacia tu wallet y generará tu ServiceCard validada."
                : "Copia este prompt y pégaselo a tu agente. Se conectará al servidor MCP de Stellar Bazaar para buscar tools, consultar precios y pagar en Testnet."}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minWidth: "220px" }}>
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
                  🚀 Kit /publish ↗
                </Link>
              ) : (
                <Link
                  href="/buyer-execution"
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
                  🛒 Workspace ↗
                </Link>
              )}
              <a
                href="/llms.txt"
                target="_blank"
                rel="noreferrer"
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
                }}
              >
                📄 /llms.txt ↗
              </a>
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

