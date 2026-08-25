import Link from "next/link";
import { PublisherForm } from "@/components/PublisherForm";

export default function Publish() {
  return (
    <main>
      <div className="mock-banner">PUBLISHER KIT · BORRADOR LOCAL / LOCAL DRAFT · SIN SECRETOS EN EL NAVEGADOR</div>
      <nav className="nav shell">
        <Link href="/" className="brand">
          <span>✦</span> Stellar Bazaar <sup>x402</sup>
        </Link>
        <div className="nav-links">
          <Link href="/#catalogo">Catálogo</Link>
          <a href="#formulario">Registrar servicio</a>
          <Link href="/docs">Docs</Link>
          <a href="https://github.com/CaBsCrypto/stellar-bazaar-x402">GitHub ↗</a>
        </div>
        <span className="network-pill">
          <i /> Draft local
        </span>
      </nav>
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
