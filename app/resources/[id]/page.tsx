import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { PaymentDemo } from "@/components/PaymentDemo";
import { TestnetPaymentDemo } from "@/components/TestnetPaymentDemo";
import { getService, services } from "@/lib/catalog";

export function generateStaticParams() {
  return services.map(({ id }) => ({ id }));
}

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = getService(id);
  if (!service) notFound();

  return (
    <main>
      <div className="mock-banner">
        ⚡ <strong>PAGO x402 EXACT EN VIVO</strong> · STELLAR TESTNET · LIQUIDACIÓN DIRECTA EN USDC · ENTREGABLES VERIFICADOS
      </div>
      <Navbar />

      <div className="shell" style={{ marginTop: "1rem" }}>
        <Breadcrumbs
          items={[
            { label: "Catálogo", href: "/catalogo" },
            { label: service.name },
          ]}
          backHref="/catalogo"
          backLabel="← Volver al Catálogo"
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
                href="/history"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#cbd5e1",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                🔒 Ver Historial
              </Link>
            </div>
          }
        />
      </div>

      <div className="detail shell" style={{ marginBottom: "4rem" }}>
        <section className="resource-info">
          <div className="detail-title">
            <span className={`service-icon ${service.accent}`}>{service.kind === "mcp" ? "M" : "↗"}</span>
            <div>
              <p className="eyebrow">{service.eyebrow} · {service.kind.toUpperCase()}</p>
              <h1>{service.name}</h1>
            </div>
          </div>
          <p className="lede">{service.description}</p>
          <div className="tag-row">
            {service.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <dl className="spec-grid">
            <div>
              <dt>Precio x402</dt>
              <dd>{service.payment.amount} {service.payment.asset}</dd>
            </div>
            <div>
              <dt>Esquema</dt>
              <dd>{service.payment.scheme}</dd>
            </div>
            <div>
              <dt>Red declarada</dt>
              <dd>{service.network}</dd>
            </div>
            <div>
              <dt>Latencia</dt>
              <dd>{service.latency}</dd>
            </div>
          </dl>
          <div className="contract-box">
            <span>ROUTE TEMPLATE · INVOCABLE VÍA x402</span>
            <code>{service.routeTemplate}</code>
          </div>
          <div className="io-grid">
            <div>
              <span>INPUT</span>
              {service.input.map((field) => <code key={field}>{field}: string</code>)}
            </div>
            <div>
              <span>OUTPUT</span>
              {service.output.map((field) => <code key={field}>{field}</code>)}
            </div>
          </div>
          <aside className="disclaimer">
            <strong>Liquidación x402 On-Chain</strong> Este recurso se liquida en Stellar Testnet en USDC SEP-41 (<code>CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA</code>).
          </aside>
        </section>
        <div>
          <PaymentDemo service={service} />
          {service.id === "swap-risk-quote" && <TestnetPaymentDemo />}
        </div>
      </div>

      <Footer />
    </main>
  );
}
