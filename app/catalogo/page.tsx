import Link from "next/link";
import { Catalog } from "@/components/Catalog";

export default function CatalogoPage() {
  return (
    <main>
      <div className="mock-banner">
        ⚡ <strong>CATÁLOGO DE SERVICIOS x402</strong> · STELLAR TESTNET · DESCUBRIMIENTO NATIVO PARA AGENTES W3C WEBMCP
      </div>

      <nav className="nav shell">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>
        <div className="nav-links">
          <Link href="/" className="active">← Volver al Inicio</Link>
          <Link href="/buyer-execution">Workspace Comprador</Link>
          <Link href="/publish">Publicar API</Link>
          <Link href="/docs">Docs</Link>
          <a href="https://github.com/CaBsCrypto/stellar-bazaar-x402" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
        <span className="network-pill"><i /> Testnet en vivo</span>
      </nav>

      <div className="shell" style={{ marginTop: "2rem", marginBottom: "4rem" }}>
        <div className="section-heading" style={{ marginBottom: "2rem" }}>
          <div>
            <span className="kicker">EXPLORADOR DE APIS Y ORÁCULOS</span>
            <h1 style={{ fontSize: "2.2rem", fontWeight: 700, margin: "0.4rem 0" }}>Catálogo Completo de Servicios</h1>
          </div>
          <p style={{ maxWidth: "680px", color: "#94a3b8", fontSize: "1rem" }}>
            Explora las herramientas, APIs y oráculos de IA disponibles para ser invocados y liquidados autónomamente en USDC sobre Stellar.
          </p>
        </div>

        <Catalog />
      </div>

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
