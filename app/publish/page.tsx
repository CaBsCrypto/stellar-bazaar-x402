import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { PublisherForm } from "@/components/PublisherForm";
import { ListingStakingSection } from "@/components/ListingStakingSection";

export default function Publish() {
  return (
    <main>
      <div className="mock-banner">PUBLISHER KIT · BORRADOR LOCAL / LOCAL DRAFT · SIN SECRETOS EN EL NAVEGADOR</div>
      <Navbar />
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
      <ListingStakingSection />

      <section className="shell publish-section" id="formulario">
        <div className="section-heading">
          <div>
            <span className="kicker">PUBLISHER KIT · LOCAL / READ-ONLY</span>
            <h2>Diseña y valida tu service card.</h2>
          </div>
          <p>Genera un manifest sin credenciales. La cola opcional es efímera y fail-closed: prueba de control → revisión manual → staging no público. Nunca activa automáticamente.</p>
        </div>
        <PublisherForm />
      </section>
    </main>
  );
}

