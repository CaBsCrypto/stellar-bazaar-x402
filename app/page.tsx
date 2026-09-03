import Link from "next/link";
import {Catalog} from "@/components/Catalog";
import {WorkflowShowcase} from "@/components/WorkflowShowcase";
import {VerifiedProviderCatalog} from "@/components/VerifiedProviderCatalog";
import {PromiseSummarySection} from "@/components/PromiseSummarySection";
import {AgentDirectConnectCard} from "@/components/AgentDirectConnectCard";

const buyerSteps=[
  ["01","Descubre","Busca APIs HTTP y tools MCP por intención y filtros."],
  ["02","Inspecciona","Revisa precio declarado, asset, esquema, red y route template."],
  ["03","Paga con x402","exact sobre Stellar Testnet. Pago requerido y verificado on-chain (0.001 USDC)."],
  ["04","Recibe resultado","El servicio responde; Bazaar no custodia ni ejecuta la política del buyer."]
];
const providerSteps=[
  ["01","Publica una service card","Describe un servicio invocable, no un perfil humano o de agente."],
  ["02","Adjunta discovery metadata","Ruta, inputs, outputs y payment requirements validables."],
  ["03","Solicita revisión","El alta real es server-to-server; el formulario público nunca recibe secretos."],
  ["04","Indexación controlada","Alta append-only sólo con storage durable y activación del operador."]
];

export default function Home(){return <main>
  <div className="mock-banner">
    ⚡ <strong>W3C WebMCP AGENT-READY</strong> · 7 TOOLS IN-BROWSER · PAGOS x402 / STELLAR EN VIVO · TESTNET · 5 SETTLEMENTS ON-CHAIN DE 0.001 USDC · <Link href="/resources/swap-risk-quote">Swap Risk Quote</Link> · <Link href="/docs">Docs / Agent Kit ↗</Link>
  </div>
  <nav className="nav shell"><Link href="/" className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></Link><div className="nav-links"><a href="#producto">Qué es</a><a href="#catalogo">Catálogo</a><a href="#proveedores-verificados">Pilotos HTTPS</a><Link href="/buyer-execution">Usar un servicio</Link><Link href="/payment-flow">Modelo x402</Link><a href="#workflows">Workflows</a><Link href="/onboarding">Onboarding</Link><Link href="/publish">Publica tu servicio</Link><Link href="/docs">Docs</Link><a href="https://github.com/CaBsCrypto/stellar-bazaar-x402">GitHub ↗</a></div><span className="network-pill"><i/> Testnet en vivo</span></nav>
  <header className="hero shell">
    <div className="hero-copy">
      <span className="kicker">W3C WEBMCP & STELLAR AGENTIC DISCOVERY LAYER</span>
      <h1>Encuentra el servicio.<br/><em>Entiende antes de pagar.</em></h1>
      <p>El primer catálogo de APIs y herramientas de IA nativo para agentes con <strong>W3C WebMCP</strong> y pagos autónomos <strong>x402 sobre Stellar Testnet</strong>.</p>
      <div className="hero-actions">
        <Link className="primary" href="/resources/swap-risk-quote">Probar Swap Risk Quote →</Link>
        <a className="ghost" href="#catalogo">Explorar catálogo</a>
      </div>
      <div className="trust-line">
        <span>🤖 7 Tools WebMCP</span>
        <span>⚡ Pagos x402 USDC/XLM</span>
        <span>🛡️ Sin custodia ni firma</span>
      </div>
    </div>
    <div className="orbital" aria-label="Flujo conceptual de discovery">
      <div className="orbit orbit-one"><span>WebMCP</span></div>
      <div className="orbit orbit-two"><span>x402</span></div>
      <div className="core"><small>AGENTIC</small><strong>✦</strong><span>WebMCP</span></div>
      <div className="floating quote">W3C STANDARD<br/><b>7 TOOLS ACTIVAS ✓</b></div>
      <div className="floating settle">EVIDENCIA<br/><b>STELLAR x402 ✓</b></div>
    </div>
  </header>

  <AgentDirectConnectCard/>

  <section className="definition shell" id="producto"><div><span className="kicker">UNA FRONTERA CLARA</span><h2>Bazaar indexa servicios pagados.</h2><p>Ayuda a buyers y agentes a encontrar rutas invocables, comparar metadata relevante y llegar al proveedor correcto.</p><Link href="/resources/swap-risk-quote" className="text-link">Ver un recurso funcionando →</Link></div><div className="definition-grid"><article className="yes"><span>SÍ ES</span><strong>Discovery + catálogo</strong><p>Service cards, búsqueda, filtros, contratos de entrada/salida y requisitos de pago declarados.</p></article><article className="no"><span>NO ES</span><strong>Wallet ni marketplace de perfiles</strong><p>No custodia, no firma, no escrow, no Passport y no contrata personas o agentes.</p></article></div></section>

  <div className="shell"><Catalog/></div>

  <VerifiedProviderCatalog/>

  <WorkflowShowcase/>

  <PromiseSummarySection/>

  <section className="journeys shell" id="flujos"><div className="section-heading"><div><span className="kicker">DOS CAMINOS, UN CATÁLOGO</span><h2>Cómo entra y sale valor.</h2></div><p>El paso de pago está activo en Testnet y verificado on-chain.</p></div><div className="journey-grid"><div className="journey"><div className="journey-title"><span>BUYER / AGENT</span><h3>De intención a resultado</h3></div>{buyerSteps.map(([n,title,copy],i)=><article key={n} className={i===2?"live-step":""}><b>{n}</b><div><strong>{title}</strong><p>{copy}</p></div>{i===2&&<em>EN VIVO · TESTNET</em>}</article>)}</div><div className="journey provider"><div className="journey-title"><span>PROVIDER</span><h3>De servicio a índice</h3></div>{providerSteps.map(([n,title,copy],i)=><article key={n} className={i===2?"live-step":""}><b>{n}</b><div><strong>{title}</strong><p>{copy}</p></div>{i===2&&<em>EN VIVO · TESTNET</em>}</article>)}</div></div></section>

  <section className="boundaries"><div className="shell"><div className="boundary-head"><span className="kicker">TRUST & SAFETY</span><h2>Metadata para decidir.<br/>Control en manos del cliente.</h2><p>Bazaar hace visible el contrato del servicio, pero no reemplaza la política de seguridad del buyer.</p></div><div className="boundary-grid"><article><span>01</span><strong>No custodia fondos</strong><p>Los pagos van del buyer al flujo x402/facilitator; el índice no guarda balances.</p></article><article><span>02</span><strong>No firma autorizaciones</strong><p>La firma y consentimiento pertenecen al wallet o agente cliente, fuera del Bazaar.</p></article><article><span>03</span><strong>No impone buyer policy</strong><p>Cada cliente decide allowlists, límites, assets y aprobación humana.</p></article><article><span>04</span><strong>Expone señales</strong><p>Las cards muestran red, asset, esquema, precio, inputs, outputs y provenance para evaluar.</p></article></div></div></section>

  <section className="milestones shell" id="roadmap"><div className="section-heading"><div><span className="kicker">ESTADO HONESTO</span><h2>Hay evidencia Testnet; no es Mainnet ni producción auditada.</h2></div></div><div className="milestone-grid"><article className="current"><span>AHORA · TESTNET VALIDADO</span><h3>Discovery → 402 → pago → resultado</h3><ul><li>Swap Risk Quote: GET /api/x402/swap-risk (402 → pago Testnet → 200)</li><li>5 settlements históricos on-chain de 0.001 USDC</li><li>7 tools MCP estrictamente read-only en /api/mcp</li><li>/publish genera y valida borradores sin credenciales de navegador</li></ul><Link className="primary" href="/resources/swap-risk-quote">Probar Swap Risk Quote →</Link></article><article><span>SIGUIENTE · SECURITY</span><h3>Identidad por provider + recibos reconciliados</h3><ul><li>Ownership de mínimo privilegio antes de update/delete</li><li>Verificación de red, asset, monto y destino</li><li>Ingest durable con controles operativos</li></ul></article><article><span>DESPUÉS · HARDENING</span><h3>Discovery evaluado + self-hosting</h3><ul><li>Facilitator propio sólo tras security review</li><li>Pubnet y uptime sólo tras auditoría</li><li>Conformance antes de claims</li></ul></article></div></section>
  <section className="final-cta shell"><span>ABIERTO A PROVIDERS Y BUYERS</span><h2>Prueba un servicio o entiende el flujo completo.</h2><p>El provider conserva su precio, destino, términos y resultado. Bazaar ofrece discovery y conformance, no custodia.</p><div className="hero-actions" style={{justifyContent:"center"}}><Link className="primary" href="/buyer-execution">Usar un servicio (demo local) →</Link><Link className="ghost" href="/payment-flow">Visualizar modelo x402</Link><Link className="ghost" href="/publish">Publica tu servicio</Link></div></section>
  <footer className="shell"><div className="brand"><span>✦</span> Stellar Bazaar x402</div><p>Apache-2.0 · Discovery + x402 Testnet · ES first</p><p>Pagos Stellar: activos en Testnet · 5 settlements on-chain de 0.001 USDC</p></footer>
</main>}
