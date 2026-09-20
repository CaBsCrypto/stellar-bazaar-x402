import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Catalog } from "@/components/Catalog";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";

export default function CatalogoPage() {
  return (
    <main>
      <div className="mock-banner">
        ⚡ <strong>CATÁLOGO DE SERVICIOS x402</strong> · STELLAR TESTNET · DESCUBRIMIENTO NATIVO PARA AGENTES W3C WEBMCP
      </div>

      <Navbar />

      <div className="shell" style={{ marginTop: "1.5rem", marginBottom: "4rem" }}>
        <Breadcrumbs
          items={[{ label: "Catálogo de Servicios" }]}
          backHref="/"
          backLabel="← Inicio"
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/agent-chat"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "rgba(112, 87, 232, 0.2)",
                  border: "1px solid rgba(112, 87, 232, 0.4)",
                  color: "#c4b5fd",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                💬 Probar en Chat
              </Link>
              <Link
                href="/publish"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "rgba(54, 185, 144, 0.2)",
                  border: "1px solid rgba(54, 185, 144, 0.4)",
                  color: "#6ee7b7",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                🚀 Publicar Skill
              </Link>
            </div>
          }
        />

        <div className="section-heading" style={{ marginBottom: "1.5rem" }}>
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

      <Footer />
    </main>
  );
}
