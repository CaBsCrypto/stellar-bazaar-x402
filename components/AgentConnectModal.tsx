"use client";

import { useState } from "react";
import Link from "next/link";

export function AgentConnectModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
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

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(8, 10, 15, 0.85)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(135deg, rgba(20, 24, 38, 0.98) 0%, rgba(13, 15, 23, 0.99) 100%)",
          border: activeTab === "seller" ? "1px solid rgba(54, 185, 144, 0.45)" : "1px solid rgba(112, 87, 232, 0.45)",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "960px",
          aspectRatio: "16 / 9",
          maxHeight: "90vh",
          padding: "2rem 2.5rem",
          boxShadow: activeTab === "seller"
            ? "0 24px 70px rgba(0, 0, 0, 0.8), 0 0 35px rgba(54, 185, 144, 0.2)"
            : "0 24px 70px rgba(0, 0, 0, 0.8), 0 0 35px rgba(112, 87, 232, 0.2)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflowY: "auto",
          transition: "border 0.3s ease, box-shadow 0.3s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1.2rem",
            right: "1.2rem",
            background: "rgba(255, 255, 255, 0.08)",
            border: "none",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "1.2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
            zIndex: 10,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
        >
          ✕
        </button>

        {/* Top Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.4rem" }}>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: "20px",
                background: activeTab === "seller" ? "rgba(54, 185, 144, 0.15)" : "rgba(112, 87, 232, 0.15)",
                color: activeTab === "seller" ? "#36b990" : "#c4b5fd",
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              ⚡ {activeTab === "seller" ? "Protocolo de Monetización (Vendedor)" : "Protocolo de Consumo (Comprador)"}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.8rem" }}>
            <div>
              <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.2rem 0", color: "#f8fafc" }}>
                {activeTab === "seller" ? "Monetiza tu API con Agentes de IA" : "Equipa a tu Agente con APIs y Oráculos"}
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.88rem", margin: 0 }}>
                {activeTab === "seller"
                  ? "Copia el prompt y pégalo en tu asistente. Cobrarás en USDC Testnet directo a tu wallet."
                  : "Copia el prompt y pégalo en tu asistente. Se conectará vía MCP para descubrir y pagar servicios."}
              </p>
            </div>

            {/* Role Switcher Tabs */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setActiveTab("seller")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: activeTab === "seller" ? "1px solid #36b990" : "1px solid rgba(255, 255, 255, 0.08)",
                  background: activeTab === "seller" ? "rgba(54, 185, 144, 0.15)" : "rgba(255, 255, 255, 0.03)",
                  color: activeTab === "seller" ? "#36b990" : "#94a3b8",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                👨‍💻 Vendedor
              </button>
              <button
                onClick={() => setActiveTab("buyer")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: activeTab === "buyer" ? "1px solid #7057e8" : "1px solid rgba(255, 255, 255, 0.08)",
                  background: activeTab === "buyer" ? "rgba(112, 87, 232, 0.15)" : "rgba(255, 255, 255, 0.03)",
                  color: activeTab === "buyer" ? "#c4b5fd" : "#94a3b8",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                🤖 Comprador
              </button>
            </div>
          </div>
        </div>

        {/* Prompt Code Box (Flexible Height) */}
        <div
          style={{
            margin: "1rem 0",
            background: "#080a0f",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            padding: "1rem 1.4rem",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.85rem",
            color: activeTab === "seller" ? "#93c5fd" : "#d8b4fe",
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
            flex: 1,
            overflowY: "auto",
            minHeight: "130px",
          }}
        >
          {currentPrompt}
        </div>

        {/* Bottom Actions Footer */}
        <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={copyPrompt}
            style={{
              flex: 2,
              minWidth: "220px",
              background: copied
                ? "#36b990"
                : activeTab === "seller"
                  ? "linear-gradient(135deg, #36b990 0%, #299874 100%)"
                  : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
              color: activeTab === "seller" ? "#081018" : "#ffffff",
              border: "none",
              borderRadius: "10px",
              padding: "0.9rem 1.4rem",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: activeTab === "seller"
                ? "0 4px 16px rgba(54, 185, 144, 0.3)"
                : "0 4px 16px rgba(112, 87, 232, 0.3)",
              transition: "all 0.2s",
            }}
          >
            {copied ? "✓ ¡Copiado al Portapapeles!" : `📋 Copiar Prompt (${activeTab === "seller" ? "Vendedor" : "Comprador"})`}
          </button>

          {activeTab === "seller" ? (
            <Link
              href="/publish"
              onClick={onClose}
              style={{
                flex: 1,
                minWidth: "140px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(54, 185, 144, 0.12)",
                border: "1px solid rgba(54, 185, 144, 0.35)",
                borderRadius: "10px",
                padding: "0.9rem 1rem",
                color: "#36b990",
                fontSize: "0.88rem",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              🚀 Kit /publish ↗
            </Link>
          ) : (
            <Link
              href="/buyer-execution"
              onClick={onClose}
              style={{
                flex: 1,
                minWidth: "140px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(112, 87, 232, 0.12)",
                border: "1px solid rgba(112, 87, 232, 0.35)",
                borderRadius: "10px",
                padding: "0.9rem 1rem",
                color: "#c4b5fd",
                fontSize: "0.88rem",
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
              minWidth: "120px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              padding: "0.9rem 1rem",
              color: "#cbd5e1",
              fontSize: "0.88rem",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            📄 /llms.txt ↗
          </a>
        </div>
      </div>
    </div>
  );
}

