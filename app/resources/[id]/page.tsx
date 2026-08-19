import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentDemo } from "@/components/PaymentDemo";
import { TestnetPaymentDemo } from "@/components/TestnetPaymentDemo";
import { getService, services } from "@/lib/catalog";

export function generateStaticParams() { return services.map(({ id }) => ({ id })); }

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = getService(id);
  if (!service) notFound();
  return (
    <main>
      <div className="mock-banner">{service.id === "swap-risk-quote" ? "PAGO x402 EXACT EN VIVO · STELLAR TESTNET · 0.001 USDC · 3 SETTLEMENTS ON-CHAIN (LEDGERS 4212660 · 4214612 · 4214711)" : "FIXTURE · PAGO x402 NO ACTIVO · METADATA NO VERIFICADA"}</div>
      <nav className="nav shell"><Link href="/" className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></Link><Link href="/#catalogo">← Volver al catálogo</Link><span className="network-pill"><i /> {service.id === "swap-risk-quote" ? "Testnet · Live" : "Fixture"}</span></nav>
      <div className="detail shell">
        <section className="resource-info">
          <div className="detail-title"><span className={`service-icon ${service.accent}`}>{service.kind === "mcp" ? "M" : "↗"}</span><div><p className="eyebrow">{service.eyebrow} · {service.kind.toUpperCase()}</p><h1>{service.name}</h1></div></div>
          <p className="lede">{service.description}</p>
          <div className="tag-row">{service.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <dl className="spec-grid">
            <div><dt>{service.id === "swap-risk-quote" ? "Precio x402 (exact)" : "Precio fixture"}</dt><dd>{service.payment.amount} {service.payment.asset}</dd></div><div><dt>Esquema</dt><dd>{service.payment.scheme}{service.payment.scheme === "upto" ? " · experimental" : ""}</dd></div>
            <div><dt>Red declarada</dt><dd>{service.network}</dd></div><div><dt>Latencia</dt><dd>{service.latency}</dd></div>
          </dl>
          <div className="contract-box"><span>{service.id === "swap-risk-quote" ? "ROUTE TEMPLATE · INVOCABLE VÍA x402" : "ROUTE TEMPLATE · NO SE INVOCA"}</span><code>{service.routeTemplate}</code></div>
          <div className="io-grid"><div><span>INPUT</span>{service.input.map((field) => <code key={field}>{field}: string</code>)}</div><div><span>OUTPUT</span>{service.output.map((field) => <code key={field}>{field}</code>)}</div></div>
          {service.id === "swap-risk-quote" ? (
          <aside className="disclaimer"><strong>Importante</strong> Este recurso es real y se paga vía x402 exact en Stellar Testnet: 0.001 USDC (10000 atomic), activo SEP-41 <code>CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA</code>. La demo no ofrece recomendación financiera.</aside>
          ) : (
          <aside className="disclaimer"><strong>Importante</strong> Este recurso, proveedor, precio y respuesta son fixtures. La demo no ofrece recomendación financiera ni prueba compatibilidad x402/upstream.</aside>
          )}
        </section>
        <div><PaymentDemo service={service} />{service.id==="swap-risk-quote"&&<TestnetPaymentDemo/>}</div>
      </div>
    </main>
  );
}
