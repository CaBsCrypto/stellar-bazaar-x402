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
👉 Contexto: https://bazaar.browns.studio/llms.txt
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp

Tus 2 tareas:
1. Agrega a nuestro endpoint el middleware HTTP 402 para cobrar en USDC Testnet a nuestra wallet Stellar (G...).
2. Genera y valida nuestro manifest 'service-card.json' usando el validador en https://bazaar.browns.studio/publish

Entrégame el endpoint listo y el JSON validado.`;

  const buyerPrompt = `Conéctate como Agente Comprador a Stellar Bazaar x402:
👉 Servidor MCP: https://bazaar.browns.studio/api/mcp
👉 Contexto: https://bazaar.browns.studio/llms.txt

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
    <>
      {/* Mobile bottom-sheet + desktop centered modal */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeInModal {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .agent-modal-overlay {
          position: fixed;
          top: 0; left: 0;
          width: 100vw; height: 100vh;
          background: rgba(8, 10, 15, 0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 9999;
          padding: 0;
        }
        .agent-modal-box {
          background: linear-gradient(135deg, rgba(20, 24, 38, 0.99) 0%, rgba(13, 15, 23, 1) 100%);
          width: 100%;
          max-height: 92dvh;
          border-radius: 20px 20px 0 0;
          padding: clamp(1.2rem, 4vw, 2rem) clamp(1rem, 4vw, 2rem);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          animation: slideUp 0.3s ease-out;
          border-top: 1px solid rgba(112, 87, 232, 0.35);
          position: relative;
        }
        .agent-modal-drag-handle {
          width: 40px;
          height: 4px;
          background: rgba(255,255,255,0.18);
          border-radius: 2px;
          margin: 0 auto 0.5rem;
        }
        .agent-modal-actions {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .agent-modal-copy-btn {
          flex: 1;
          min-width: 0;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.9rem;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .agent-modal-link-btn {
          flex: 0 0 auto;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.85rem;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        @media (min-width: 640px) {
          .agent-modal-overlay {
            align-items: center;
            padding: 1rem;
          }
          .agent-modal-box {
            border-radius: 20px;
            max-width: 680px;
            max-height: 88vh;
            animation: fadeInModal 0.25s ease-out;
            border: 1px solid rgba(112, 87, 232, 0.4);
          }
          .agent-modal-drag-handle {
            display: none;
          }
        }
      `}</style>

      <div className="agent-modal-overlay" onClick={onClose}>
        <div className="agent-modal-box" onClick={(e) => e.stopPropagation()}>
          {/* Drag handle (mobile) */}
          <div className="agent-modal-drag-handle" />

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              minWidth: "36px",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            ✕
          </button>

          {/* Badge */}
          <div style={{ paddingRight: "2.5rem" }}>
            <span
              style={{
                display: "inline-block",
                padding: "3px 10px",
                borderRadius: "20px",
                background: activeTab === "seller" ? "rgba(54, 185, 144, 0.15)" : "rgba(112, 87, 232, 0.15)",
                color: activeTab === "seller" ? "#36b990" : "#c4b5fd",
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "0.5rem",
              }}
            >
              ⚡ {activeTab === "seller" ? "Protocolo Vendedor" : "Protocolo Comprador"}
            </span>
            <h2 style={{ fontSize: "clamp(1.1rem, 4vw, 1.5rem)", fontWeight: 700, margin: "0 0 0.25rem", color: "#f8fafc" }}>
              {activeTab === "seller" ? "Monetiza tu API con Agentes de IA" : "Equipa tu Agente con APIs y Oráculos"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>
              {activeTab === "seller"
                ? "Copia el prompt y pégalo en tu asistente. Cobrarás en USDC Testnet directo a tu wallet."
                : "Copia el prompt y pégalo en tu asistente. Se conectará vía MCP para descubrir y pagar servicios."}
            </p>
          </div>

          {/* Role Tabs */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setActiveTab("seller")}
              style={{
                flex: 1,
                padding: "0.55rem 0.5rem",
                borderRadius: "8px",
                border: activeTab === "seller" ? "1px solid #36b990" : "1px solid rgba(255, 255, 255, 0.08)",
                background: activeTab === "seller" ? "rgba(54, 185, 144, 0.15)" : "rgba(255, 255, 255, 0.03)",
                color: activeTab === "seller" ? "#36b990" : "#94a3b8",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              👨‍💻 Vendedor
            </button>
            <button
              onClick={() => setActiveTab("buyer")}
              style={{
                flex: 1,
                padding: "0.55rem 0.5rem",
                borderRadius: "8px",
                border: activeTab === "buyer" ? "1px solid #7057e8" : "1px solid rgba(255, 255, 255, 0.08)",
                background: activeTab === "buyer" ? "rgba(112, 87, 232, 0.15)" : "rgba(255, 255, 255, 0.03)",
                color: activeTab === "buyer" ? "#c4b5fd" : "#94a3b8",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              🤖 Comprador
            </button>
          </div>

          {/* Prompt Code Box */}
          <div
            style={{
              background: "#080a0f",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              padding: "0.9rem 1rem",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "0.8rem",
              color: activeTab === "seller" ? "#93c5fd" : "#d8b4fe",
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
              overflowY: "auto",
              maxHeight: "200px",
            }}
          >
            {currentPrompt}
          </div>

          {/* Actions */}
          <div className="agent-modal-actions">
            <button
              onClick={copyPrompt}
              className="agent-modal-copy-btn"
              style={{
                background: copied
                  ? "#36b990"
                  : activeTab === "seller"
                    ? "linear-gradient(135deg, #36b990 0%, #299874 100%)"
                    : "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
                color: activeTab === "seller" ? "#081018" : "#ffffff",
                boxShadow: activeTab === "seller"
                  ? "0 4px 16px rgba(54, 185, 144, 0.3)"
                  : "0 4px 16px rgba(112, 87, 232, 0.3)",
              }}
            >
              {copied ? "✓ ¡Copiado!" : `📋 Copiar Prompt`}
            </button>

            {activeTab === "seller" ? (
              <Link
                href="/publish"
                onClick={onClose}
                className="agent-modal-link-btn"
                style={{
                  background: "rgba(54, 185, 144, 0.12)",
                  border: "1px solid rgba(54, 185, 144, 0.35)",
                  color: "#36b990",
                }}
              >
                🚀 /publish ↗
              </Link>
            ) : (
              <Link
                href="/buyer-execution"
                onClick={onClose}
                className="agent-modal-link-btn"
                style={{
                  background: "rgba(112, 87, 232, 0.12)",
                  border: "1px solid rgba(112, 87, 232, 0.35)",
                  color: "#c4b5fd",
                }}
              >
                🛒 Workspace ↗
              </Link>
            )}

            <a
              href="/llms.txt"
              target="_blank"
              rel="noreferrer"
              className="agent-modal-link-btn"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#cbd5e1",
              }}
            >
              📄 llms.txt
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
