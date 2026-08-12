import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentDemo } from "@/components/PaymentDemo";
import { getService, services } from "@/lib/catalog";

export function generateStaticParams() { return services.map(({ id }) => ({ id })); }

export default function ResourcePage({ params }: { params: { id: string } }) {
  const service = getService(params.id);
  if (!service) notFound();
  return (
    <main>
      <div className="mock-banner">MVP LOCAL — ENDPOINT READ-ONLY REAL · SIN PAGO, FIRMA, FACILITATOR O TRANSACCIÓN STELLAR</div>
      <nav className="nav shell"><Link href="/" className="brand"><span>✦</span> Stellar Bazaar <sup>x402</sup></Link><Link href="/#catalogo">← Volver al catálogo</Link><span className="network-pill"><i /> Fixture</span></nav>
      <div className="detail shell">
        <section className="resource-info">
          <div className="detail-title"><span className={`service-icon ${service.accent}`}>{service.kind === "mcp" ? "M" : "↗"}</span><div><p className="eyebrow">{service.eyebrow} · {service.kind.toUpperCase()}</p><h1>{service.name}</h1></div></div>
          <p className="lede">{service.description}</p>
          <div className="tag-row">{service.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <dl className="spec-grid">
            <div><dt>Precio fixture</dt><dd>{service.payment.amount} {service.payment.asset}</dd></div><div><dt>Esquema</dt><dd>{service.payment.scheme}{service.payment.scheme === "upto" ? " · experimental" : ""}</dd></div>
            <div><dt>Red declarada</dt><dd>{service.network}</dd></div><div><dt>Latencia</dt><dd>{service.latency}</dd></div>
          </dl>
          <div className="contract-box"><span>ROUTE TEMPLATE · NO SE INVOCA</span><code>{service.routeTemplate}</code></div>
          <div className="io-grid"><div><span>INPUT</span>{service.input.map((field) => <code key={field}>{field}: string</code>)}</div><div><span>OUTPUT</span>{service.output.map((field) => <code key={field}>{field}</code>)}</div></div>
          <aside className="disclaimer"><strong>Importante</strong> Este recurso, proveedor, precio y respuesta son fixtures. La demo no ofrece recomendación financiera ni prueba compatibilidad x402/upstream.</aside>
        </section>
        <PaymentDemo service={service} />
      </div>
    </main>
  );
}
