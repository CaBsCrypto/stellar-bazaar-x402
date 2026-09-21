import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { PublisherForm } from "@/components/PublisherForm";
import { ListingStakingSection } from "@/components/ListingStakingSection";

export default function Publish() {
  return (
    <main>
      <div className="mock-banner">PUBLISHER KIT · BORRADOR LOCAL / LOCAL DRAFT · SIN SECRETOS EN EL NAVEGADOR</div>
      <Navbar />

      <div className="shell" style={{ marginTop: "1rem" }}>
        <Breadcrumbs
          items={[{ label: "Publicar API & Validador" }]}
          backHref="/catalogo"
          backLabel="← Volver al Catálogo"
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/docs"
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
                📚 Ver Docs de Integración
              </Link>
              <Link
                href="/fee-split"
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
                Fee split · Experimental
              </Link>
            </div>
          }
        />
      </div>

      <header className="publish-hero shell">
        <span className="kicker">PUBLICA TU SERVICIO</span>
        <h1>
          Trae tu API o tool MCP.
          <br />
          <em>Tú defines el precio.</em>
        </h1>
        <p>
          Prepara una service card con metadata interoperable y comprueba reglas deterministas antes de
          solicitar una revisión manual con prueba de control del endpoint. Prepare and validate locally before endpoint-control proof and operator review.
        </p>
        <div className="provider-promise">
          <span>Tu destino</span>
          <span>Tus términos</span>
          <span>Tu resultado</span>
          <span>Sin custodia Bazaar</span>
        </div>
      </header>

      {/* Seccion de Listing & Staking DeFindex */}
      {process.env.BAZAAR_UI_SHOW_EXPERIMENTAL_STAKING === "true" && <ListingStakingSection />}

      <section className="shell publish-section" id="formulario" style={{ marginBottom: "4rem" }}>
        <div className="section-heading">
          <div>
            <span className="kicker">PUBLISHER KIT · LOCAL / READ-ONLY</span>
            <h2>Diseña y valida tu service card.</h2>
          </div>
          <p>Genera un manifest sin credenciales. La cola opcional es efímera y fail-closed: prueba de control → revisión manual → staging no público. Nunca activa automáticamente.</p>
        </div>
        <PublisherForm />
      </section>

      <Footer />
    </main>
  );
}

