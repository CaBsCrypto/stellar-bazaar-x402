import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Catalog } from "@/components/Catalog";
import { AgentDirectConnectCard } from "@/components/AgentDirectConnectCard";
import { WorkflowShowcase } from "@/components/WorkflowShowcase";
import { LandingClientWrapper } from "@/components/LandingClientWrapper";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <div className="mock-banner">
        ⚡ <strong>W3C WebMCP & x402 EN VIVO</strong> · STELLAR TESTNET · LIQUIDACIÓN DIRECTA EN USDC · <Link href="/publish">Publicar un Servicio de IA →</Link>
      </div>

      <Navbar />

      <header className="hero shell" style={{ paddingBottom: "1.5rem" }}>
        <div className="hero-copy">
          <span className="kicker">STELLAR AGENTIC DISCOVERY & x402 PAYMENTS</span>
          <h1>Marketplace de Servicios de IA para Agentes Autónomos.</h1>
          <p>
            Descubre, invoca y monetiza APIs mediante <strong>W3C WebMCP</strong> y micropagos instantáneos <strong>x402 en USDC sobre Stellar</strong>.
          </p>
          <LandingClientWrapper>
            <div className="trust-line">
              <span>🤖 Tools WebMCP & APIs</span>
              <span>⚡ Pagos x402 USDC</span>
              <span>🛡️ No-custodial (99/1 split)</span>
            </div>
          </LandingClientWrapper>
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

      <Footer />
    </main>
  );
}
