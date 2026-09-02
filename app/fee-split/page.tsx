import Link from "next/link";
import { BAZAAR_FEE_BPS } from "@/lib/fee-split-design";
import "./fee-split.css";

const sample = { gross: "0.0010000", provider: "0.0009900", bazaar: "0.0000100" };

export default function FeeSplitDesignPage() {
  return (
    <main className="split-page">
      <div className="split-warning">DISEÑO V0 · NO ACTIVO · SIN CONTRATO DESPLEGADO · SIN PAGOS</div>
      <nav className="nav shell">
        <Link href="/" className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></Link>
        <div className="nav-links">
          <Link href="/payment-flow">Flujo de pago</Link>
          <Link href="/docs">Documentación</Link>
          <Link href="/publish">Publisher Kit</Link>
        </div>
        <span className="split-pill">Testnet design</span>
      </nav>

      <section className="split-hero shell">
        <div>
          <p className="eyebrow">Comisión no custodial / Non-custodial fee</p>
          <h1>Un precio visible.<br /><em>Dos destinos atómicos.</em></h1>
          <p className="split-lede">
            El comprador paga el precio publicado. El valor predeterminado entrega 99% al proveedor y 1% a Bazaar,
            sin que Bazaar guarde llaves ni retenga fondos. Esta página explica el diseño futuro;
            el x402 actual continúa pagando directamente a un solo proveedor.
          </p>
          <p className="split-en">The buyer pays the displayed price. The default policy gives 99% to the provider and 1% to Bazaar. Each quote locks its disclosed rate. No custody, wallet, or deployed split is claimed.</p>
        </div>
        <div className="split-summary" aria-label="Ejemplo de distribución de pago">
          <span>Ejemplo exacto / Exact example</span>
          <strong>{sample.gross} USDC</strong>
          <div><span>Proveedor · 99%</span><b>{sample.provider}</b></div>
          <div><span>Bazaar · {BAZAAR_FEE_BPS / 100}%</span><b>{sample.bazaar}</b></div>
          <small>10,000 atomic units → 9,900 + 100 · sin redondeo</small>
        </div>
      </section>

      <section className="split-section shell">
        <p className="eyebrow">Flujo propuesto / Proposed flow</p>
        <h2>El router reparte; Bazaar nunca toca las llaves.</h2>
        <div className="split-flow">
          <article><span>01</span><h3>Precio bruto</h3><p>La Service Card declara total, comisión y neto antes de autorizar.</p><small>Gross price disclosed before authorization.</small></article>
          <article><span>02</span><h3>Una autorización</h3><p>El comprador firma una llamada ligada a solicitud, activo y destinos.</p><small>One buyer-controlled, request-bound authorization.</small></article>
          <article><span>03</span><h3>Split atómico</h3><p>Un futuro router Soroban ejecuta ambas transferencias o revierte todo.</p><small>Both transfers succeed together or the operation reverts.</small></article>
          <article><span>04</span><h3>Recibo reconciliado</h3><p>Se verifican activo, total, destinos, montos, solicitud y Service Card.</p><small>Receipt reconciles payment with the purchased capability.</small></article>
        </div>
      </section>

      <section className="split-section split-boundaries shell">
        <div>
          <p className="eyebrow">Sí / In scope</p>
          <h2>Reglas del diseño</h2>
          <ul>
            <li>1% predeterminado; cualquier tasa acordada queda fijada antes de autorizar.</li>
            <li>Una operación atómica, dos transferencias directas.</li>
            <li>USDC y Stellar Testnet durante validación.</li>
            <li>Fail-closed ante monto, activo, destino o binding incorrecto.</li>
          </ul>
        </div>
        <div className="split-no">
          <p className="eyebrow">No / Out of scope</p>
          <h2>No es escrow</h2>
          <ul>
            <li>No custodia ni retención temporal.</li>
            <li>No wallet, firma delegada ni claves en Bazaar.</li>
            <li>No dos pagos independientes ni cobro posterior informal.</li>
            <li>No compatibilidad x402/facilitador afirmada todavía.</li>
          </ul>
        </div>
      </section>

      <section className="split-gate shell">
        <div><p className="eyebrow">Gate técnico / Technical gate</p><h2>Antes de un pago</h2></div>
        <p>Contrato aislado → tests unitarios/property/fuzz → revisión de auth y no custodia → mecanismo x402 soportado por comprador y facilitador → despliegue Testnet → una prueba mínima reconciliada. Mainnet exige auditoría independiente.</p>
      </section>

      <footer className="shell"><div className="brand"><span>✦</span> Stellar Bazaar x402</div><p>Design-only · Apache-2.0 · No custody · No escrow</p></footer>
    </main>
  );
}
