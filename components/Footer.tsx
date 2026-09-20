"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        background: "linear-gradient(180deg, rgba(8, 10, 16, 0.4) 0%, rgba(4, 5, 8, 0.95) 100%)",
        paddingTop: "3.5rem",
        paddingBottom: "3rem",
        marginTop: "4rem",
      }}
    >
      <div className="shell">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "2.5rem",
            marginBottom: "3rem",
          }}
        >
          {/* Brand Col */}
          <div style={{ maxWidth: "320px" }}>
            <Link href="/" className="brand" style={{ textDecoration: "none", fontSize: "1.15rem", display: "inline-block", marginBottom: "1rem" }}>
              <span>✦</span> Stellar Bazaar <sup>x402</sup>
            </Link>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6, margin: "0 0 1.2rem 0" }}>
              Capa de descubrimiento determinista y liquidación instantánea de micropagos x402 sobre Stellar Testnet.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#6ee7b7",
                padding: "4px 10px",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
              Testnet en vivo · USDC SEP-41
            </span>
          </div>

          {/* Col 1: Catálogo & Servicios */}
          <div>
            <h4 style={{ color: "#f8fafc", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", fontWeight: 700 }}>
              Catálogo & Servicios
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
              <li>
                <Link href="/catalogo" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  Ver Catálogo Completo
                </Link>
              </li>
              <li>
                <Link href="/resources/ai-video-scriptwriter" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  🎬 AI Video Scriptwriter (0.02 USDC)
                </Link>
              </li>
              <li>
                <Link href="/resources/swap-risk-quote" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  🧪 Swap Risk Sandbox (0.001 USDC)
                </Link>
              </li>
              <li>
                <a href="/api/discovery/search?query=video" target="_blank" rel="noreferrer" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  REST Discovery API ↗
                </a>
              </li>
            </ul>
          </div>

          {/* Col 2: Agentes & Laboratorio */}
          <div>
            <h4 style={{ color: "#f8fafc", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", fontWeight: 700 }}>
              Agentes & IA
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
              <li>
                <Link href="/agent-chat" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  💬 Agent Chat Live
                </Link>
              </li>
              <li>
                <Link href="/webmcp-playground" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  🤖 WebMCP Playground
                </Link>
              </li>
              <li>
                <Link href="/buyer-execution" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  ⚡ Buyer Workspace
                </Link>
              </li>
              <li>
                <a href="/api/mcp" target="_blank" rel="noreferrer" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  Servidor MCP Streamable ↗
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Desarrolladores & Protocolo */}
          <div>
            <h4 style={{ color: "#f8fafc", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", fontWeight: 700 }}>
              Desarrolladores & Docs
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
              <li>
                <Link href="/publish" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  🚀 Publicar & Validar API
                </Link>
              </li>
              <li>
                <Link href="/fee-split" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  💰 Fee Split 99% / 1%
                </Link>
              </li>
              <li>
                <Link href="/docs" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  📚 Documentación Técnica
                </Link>
              </li>
              <li>
                <a href="/llms.txt" target="_blank" rel="noreferrer" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  Especificación llms.txt ↗
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Usuario & Transparencia */}
          <div>
            <h4 style={{ color: "#f8fafc", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", fontWeight: 700 }}>
              Tu Espacio
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
              <li>
                <Link href="/history" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  🔒 Mi Historial Privado
                </Link>
              </li>
              <li>
                <Link href="/history/review" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  👁️ Demo de Entregables
                </Link>
              </li>
              <li>
                <a href="/api/capabilities" target="_blank" rel="noreferrer" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  ⚙️ Capacidades del Protocolo ↗
                </a>
              </li>
              <li>
                <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer" style={{ color: "#94a3b8", fontSize: "0.85rem", textDecoration: "none" }}>
                  🌐 Stellar Expert Explorer ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            paddingTop: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            color: "#64748b",
            fontSize: "0.82rem",
          }}
        >
          <span>© {new Date().getFullYear()} Stellar Bazaar x402 · Open Decentralized Agent Marketplace</span>
          <span>Liquidación en vivo con facilitadores OpenZeppelin & Stellar Horizon</span>
        </div>
      </div>
    </footer>
  );
}
