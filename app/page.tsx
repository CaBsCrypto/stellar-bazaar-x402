import Link from "next/link";
import { Catalog } from "@/components/Catalog";
import { AgentDirectConnectCard } from "@/components/AgentDirectConnectCard";
import { WorkflowShowcase } from "@/components/WorkflowShowcase";

export default function Home() {
  return (
    <main>
      <div className="mock-banner">
        ⚡ <strong>W3C WebMCP & x402 EN VIVO</strong> · STELLAR TESTNET · 7 TOOLS ACTIVAS · LIQUIDACIÓN DIRECTA EN USDC · <Link href="/resources/swap-risk-quote">Swap Risk Quote →</Link>
      </div>

      <nav className="nav shell">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>
        <div className="nav-links">
          <a href="#catalogo">Catálogo</a>
          <a href="#conectar-agente">Conectar Agente</a>
          <Link href="/buyer-execution">Workspace Comprador</Link>
          <Link href="/publish">Publicar API</Link>
          <Link href="/docs">Docs</Link>
          <a href="https://github.com/CaBsCrypto/stellar-bazaar-x402" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
        <span className="network-pill"><i /> Testnet en vivo</span>
      </nav>

      <header className="hero shell" style={{ paddingBottom: "1.5rem" }}>
        <div className="hero-copy">
          <span className="kicker">STELLAR AGENTIC DISCOVERY & x402 PAYMENTS</span>
          <h1>Marketplace de Servicios de IA para Agentes Autónomos.</h1>
          <p>
            Descubre, invoca y monetiza APIs mediante <strong>W3C WebMCP</strong> y micropagos instantáneos <strong>x402 en USDC sobre Stellar</strong>.
          </p>
          <div className="hero-actions">
            <a className="primary" href="#conectar-agente">Conectar mi Agente →</a>
            <a className="ghost" href="#catalogo">Explorar Catálogo ({">"}5 servicios)</a>
          </div>
          <div className="trust-line">
            <span>🤖 7 Tools WebMCP</span>
            <span>⚡ Pagos x402 USDC</span>
            <span>🛡️ No-custodial (99/1 split)</span>
          </div>
        </div>
        <div className="orbital" aria-label="Flujo conceptual de discovery">
          <div className="orbit orbit-one"><span>WebMCP</span></div>
          <div className="orbit orbit-two"><span>x402</span></div>
          <div className="core"><small>STELLAR</small><strong>✦</strong><span>BAZAAR</span></div>
          <div className="floating quote">W3C STANDARD<br /><b>7 TOOLS MCP ✓</b></div>
          <div className="floating settle">USDC TESTNET<br /><b>LIQUIDACIÓN REAL ✓</b></div>
        </div>
      </header>

      <div id="conectar-agente">
        <AgentDirectConnectCard />
      </div>

      <section className="shell" id="catalogo" style={{ marginTop: "1rem" }}>
        <div className="section-heading" style={{ marginBottom: "1.5rem" }}>
          <div>
            <span className="kicker">MARKETPLACE INDEX</span>
            <h2>Servicios y Oráculos Listados</h2>
          </div>
          <p>Herramientas listas para ser descubiertas y pagadas por cualquier agente de IA en segundos.</p>
        </div>
        <Catalog />
      </section>

      <WorkflowShowcase />

      <section className="shell" style={{ margin: "4rem auto 2rem auto" }}>
        <div
          style={{
            background: "linear-gradient(135deg, rgba(20, 24, 38, 0.6) 0%, rgba(13, 15, 23, 0.8) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "2.5rem 2rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "2rem",
          }}
        >
          <div>
            <span style={{ color: "#36b990", fontWeight: 700, fontSize: "1.1rem" }}>01. Descubre</span>
            <h3 style={{ margin: "0.4rem 0 0.6rem 0", fontSize: "1.2rem" }}>Por MCP o Web</h3>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              Tu agente consulta el servidor MCP y obtiene schemas de inputs, outputs y precios en USDC.
            </p>
          </div>
          <div>
            <span style={{ color: "#7057e8", fontWeight: 700, fontSize: "1.1rem" }}>02. Paga con x402</span>
            <h3 style={{ margin: "0.4rem 0 0.6rem 0", fontSize: "1.2rem" }}>Sin Fricción ni Custodia</h3>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              El agente liquida en 4 segundos vía Stellar Testnet. 99% va al proveedor y 1% a la tesorería.
            </p>
          </div>
          <div>
            <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "1.1rem" }}>03. Entrega Inmutable</span>
            <h3 style={{ margin: "0.4rem 0 0.6rem 0", fontSize: "1.2rem" }}>Resultado Verificado</h3>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              El proveedor entrega el resultado junto con el recibo on-chain y hash criptográfico verificable.
            </p>
          </div>
        </div>
      </section>

      <footer className="shell" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></div>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>
            Stellar Agentic Infrastructure · Discovery Layer & x402 Micropayments
          </p>
        </div>
      </footer>
    </main>
  );
}
