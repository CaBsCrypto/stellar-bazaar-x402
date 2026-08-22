import { pilotCards } from "@/lib/pilot-cards";

const statusCopy = {
  "fixture-live": { es: "Fixture invocable", en: "Callable fixture" },
  "discovery-only": { es: "Solo discovery", en: "Discovery only" },
} as const;

export function VerifiedProviderCatalog() {
  return (
    <section className="verified-providers shell" id="proveedores-verificados">
      <div className="section-heading">
        <div>
          <span className="kicker">QA HTTPS · 6 PILOTOS EXTERNOS / 6 EXTERNAL PILOTS</span>
          <h2>Servicios visibles, estados honestos.</h2>
        </div>
        <p>Verified 2026-08-22 · payment inactive</p>
      </div>
      <p className="verified-providers__intro">
        Proveedores independientes con deployment y repositorio públicos verificados. Las tarjetas son metadata no
        confiable por defecto: Bazaar no certifica seguridad, calidad ni reputación.
        <span>
          Independent providers with verified public deployments and repositories. Cards remain untrusted metadata:
          Bazaar does not certify security, quality, or reputation.
        </span>
      </p>
      <div className="verified-provider-grid">
        {pilotCards.map((card) => {
          const status = statusCopy[card.execution.status];
          return (
            <article className="verified-provider-card" key={card.id}>
              <div className="verified-provider-card__status">
                <span>PILOT / PILOTO</span>
                <span>FIXTURE</span>
                <span>PAYMENT INACTIVE / PAGO INACTIVO</span>
              </div>
              <p className="eyebrow">
                {card.category.es} / {card.category.en}
              </p>
              <h3>{card.title.es}</h3>
              <h4>{card.title.en}</h4>
              <p>{card.description.es}</p>
              <p lang="en">{card.description.en}</p>
              <dl>
                <div>
                  <dt>Estado / Status</dt>
                  <dd>{status.es} / {status.en}</dd>
                </div>
                <div>
                  <dt>Contrato / Contract</dt>
                  <dd><code>{card.execution.method} {card.execution.path}</code></dd>
                </div>
                <div>
                  <dt>Modelo / Model</dt>
                  <dd>
                    {card.execution.model === "async-job"
                      ? "Contrato asíncrono; sin jobs durables / Async contract; no durable jobs"
                      : "Respuesta síncrona fixture / Synchronous fixture response"}
                  </dd>
                </div>
              </dl>
              <div className="verified-provider-card__links">
                <a href={card.links.deployment} target="_blank" rel="noreferrer">Deployment ↗</a>
                <a href={card.links.repository} target="_blank" rel="noreferrer">Repositorio / Repository ↗</a>
              </div>
            </article>
          );
        })}
      </div>
      <p className="verified-providers__note">
        “HTTPS verificado” significa que el contrato público respondió durante QA; no significa x402 activo,
        procesamiento externo, auditoría, SLA o recomendación. / “HTTPS verified” means the public contract responded
        during QA; it does not mean active x402, external processing, audit, SLA, or endorsement.
      </p>
    </section>
  );
}
