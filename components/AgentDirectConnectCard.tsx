"use client";

import { useState } from "react";

export function AgentDirectConnectCard() {
  const [copied, setCopied] = useState(false);

  const promptText = `Conecta nuestro servicio al marketplace de Stellar Bazaar x402:
👉 Contexto: https://stellar-bazaar-x402.vercel.app/llms.txt
👉 Servidor MCP: https://stellar-bazaar-x402.vercel.app/api/mcp

Tus 2 tareas:
1. Agrega a nuestro endpoint el middleware HTTP 402 para cobrar en USDC Testnet a nuestra wallet Stellar (G...).
2. Genera y valida nuestro manifest 'service-card.json' usando el validador en https://stellar-bazaar-x402.vercel.app/publish

Entrégame el endpoint listo y el JSON validado.`;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
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
          border: "1px solid rgba(54, 185, 144, 0.3)",
          borderRadius: "16px",
          padding: "2rem",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(54, 185, 144, 0.08)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "3px",
            background: "linear-gradient(90deg, #36b990, #7057e8, #36b990)",
          }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem" }}>
          <div style={{ maxWidth: "620px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "20px",
                background: "rgba(54, 185, 144, 0.15)",
                color: "#36b990",
                fontSize: "0.8rem",
                fontWeight: 600,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                marginBottom: "0.8rem",
              }}
            >
              ⚡ Onboarding Instantáneo para Agentes & Desarrolladores
            </span>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.2rem 0 0.6rem 0", color: "#f8fafc" }}>
              ¿Quieres monetizar tu API o Agente en minutos?
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.95rem", lineHeight: 1.6, margin: 0 }}>
              Copia este prompt y pégaselo a tu agente de IA (Cursor, Claude, ChatGPT o tu bot local). Tu agente leerá nuestra especificación <strong>MCP y LLM Context</strong>, implementará el cobro HTTP 402 en USDC y validará su ServiceCard automáticamente.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minWidth: "220px" }}>
            <button
              onClick={copyPrompt}
              style={{
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
                transition: "all 0.2s ease",
                boxShadow: "0 4px 14px rgba(54, 185, 144, 0.3)",
              }}
            >
              {copied ? "✓ ¡Prompt Copiado!" : "📋 Copiar Prompt para tu Agente"}
            </button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
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
                📄 Ver /llms.txt ↗
              </a>
              <a
                href="/api/mcp"
                target="_blank"
                rel="noreferrer"
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
                }}
              >
                🤖 Servidor MCP ↗
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
            color: "#93c5fd",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {promptText}
        </div>
      </div>
    </section>
  );
}
