import Link from "next/link";
import { PublisherForm } from "@/components/PublisherForm";

export default function Publish() {
  return (
    <main>
      <div className="mock-banner">PUBLISHER KIT · REGISTRO REAL · AUTH VÍA BAZAAR_PROVIDER_SECRET · PERSISTENCIA EN UPSTASH REDIS</div>
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
          <i /> Registro en vivo
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
          Registra una service card con metadata interoperable, pasa las reglas deterministas y entra en el
          catálogo de discovery x402 para agentes autónomos.
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
            <span className="kicker">PUBLISHER KIT · EN VIVO</span>
            <h2>Diseña, valida y registra tu service card.</h2>
          </div>
          <p>Tras el alta, tu servicio es descubrible por REST y MCP y persiste en Upstash Redis (sobrevive redeploys; verificado en producción).</p>
        </div>
        <PublisherForm />
      </section>
    </main>
  );
}