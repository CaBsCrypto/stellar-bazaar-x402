"use client";

import { useState } from "react";

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
        backdropFilter: "blur(8px)",
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
          border: "1px solid rgba(54, 185, 144, 0.4)",
          borderRadius: "20px",
          maxWidth: "680px",
          width: "100%",
          padding: "2rem",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(54, 185, 144, 0.15)",
          position: "relative",
          animation: "modalFadeIn 0.25s ease-out",
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
            width: "32px",
            height: "32px",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "1.2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
        >
          ✕
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.5rem" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "20px",
              background: "rgba(54, 185, 144, 0.15)",
              color: "#36b990",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            ⚡ Protocolo de Conexión
          </span>
        </div>

        <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.4rem 0 0.8rem 0", color: "#f8fafc" }}>
          Conecta tu Agente a Stellar Bazaar
        </h2>

        <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 1.2rem 0" }}>
          Selecciona tu rol, copia el prompt optimizado y pégalo en tu asistente de IA (Cursor, Claude, ChatGPT o tu bot local).
        </p>

        {/* Tab Selector */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            onClick={() => setActiveTab("seller")}
            style={{
              flex: 1,
              padding: "0.6rem 1rem",
              borderRadius: "10px",
              border: activeTab === "seller" ? "1px solid #36b990" : "1px solid rgba(255, 255, 255, 0.08)",
              background: activeTab === "seller" ? "rgba(54, 185, 144, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "seller" ? "#36b990" : "#94a3b8",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            👨‍💻 Modo Vendedor (Monetizar mi API)
          </button>
          <button
            onClick={() => setActiveTab("buyer")}
            style={{
              flex: 1,
              padding: "0.6rem 1rem",
              borderRadius: "10px",
              border: activeTab === "buyer" ? "1px solid #7057e8" : "1px solid rgba(255, 255, 255, 0.08)",
              background: activeTab === "buyer" ? "rgba(112, 87, 232, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "buyer" ? "#c4b5fd" : "#94a3b8",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            🤖 Modo Comprador (Consumir Servicios)
          </button>
        </div>

        {/* Prompt Box */}
        <div
          style={{
            background: "#080a0f",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            padding: "1rem 1.2rem",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.82rem",
            color: activeTab === "seller" ? "#93c5fd" : "#d8b4fe",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            marginBottom: "1.4rem",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {currentPrompt}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
          <button
            onClick={copyPrompt}
            style={{
              flex: 2,
              minWidth: "200px",
              background: copied ? "#36b990" : "linear-gradient(135deg, #36b990 0%, #299874 100%)",
              color: "#081018",
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
              boxShadow: "0 4px 14px rgba(54, 185, 144, 0.3)",
              transition: "all 0.2s",
            }}
          >
            {copied ? "✓ ¡Copiado al Portapapeles!" : "📋 Copiar Prompt para mi Agente"}
          </button>
          <a
            href="/llms.txt"
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              padding: "0.85rem 1rem",
              color: "#cbd5e1",
              fontSize: "0.85rem",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            📄 /llms.txt ↗
          </a>
          <a
            href="/api/mcp"
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(112, 87, 232, 0.1)",
              border: "1px solid rgba(112, 87, 232, 0.3)",
              borderRadius: "10px",
              padding: "0.85rem 1rem",
              color: "#c4b5fd",
              fontSize: "0.85rem",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            🤖 /api/mcp ↗
          </a>
        </div>
      </div>
    </div>
  );
}
