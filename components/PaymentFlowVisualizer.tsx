"use client";

import { useMemo, useState } from "react";
import { pilotCards } from "@/lib/pilot-cards";
import { getPaymentFlow, type PaymentFlowStatus } from "@/lib/payment-flow";

const serviceOptions = [
  { id: "swap-risk-quote", name: "Swap Risk Quote · Testnet evidence" },
  ...pilotCards.map((card) => ({ id: card.id, name: `${card.title.es} / ${card.title.en}` })),
];

const statusCopy: Record<PaymentFlowStatus, { es: string; en: string }> = {
  available: { es: "Disponible", en: "Available" },
  "buyer-controlled": { es: "Control del buyer", en: "Buyer-controlled" },
  fixture: { es: "Fixture", en: "Fixture" },
  "testnet-evidence": { es: "Evidencia Testnet", en: "Testnet evidence" },
  "pending-provider": { es: "Pendiente del provider", en: "Provider pending" },
  inactive: { es: "Inactivo", en: "Inactive" },
};

export function PaymentFlowVisualizer() {
  const [serviceId, setServiceId] = useState("swap-risk-quote");
  const [activeIndex, setActiveIndex] = useState(0);
  const flow = useMemo(() => getPaymentFlow(serviceId), [serviceId]);

  if (!flow) return null;
  const stage = flow.stages[activeIndex];
  const status = statusCopy[stage.status];

  function chooseService(id: string) {
    setServiceId(id);
    setActiveIndex(0);
  }

  return (
    <section className="payment-flow-viz" aria-labelledby="payment-flow-title">
      <div className="payment-flow-viz__warning">
        VISUALIZACIÓN LOCAL / LOCAL VISUALIZATION · NO WALLET · NO SIGNING · NO PAYMENT · NO PROVIDER CALL
      </div>
      <div className="payment-flow-viz__head">
        <div>
          <span className="kicker">BUYER ↔ PROVIDER · x402 STATE MODEL</span>
          <h1 id="payment-flow-title">Del discovery al receipt, sin ocultar responsabilidades.</h1>
          <p lang="en">From discovery to receipt, with responsibilities made explicit.</p>
        </div>
        <label>
          Servicio / Service
          <select value={serviceId} onChange={(event) => chooseService(event.target.value)}>
            {serviceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
      </div>

      <div className="payment-flow-viz__summary">
        <div><span>Run</span><strong>Visualization only</strong></div>
        <div><span>Network</span><strong>Stellar Testnet</strong></div>
        <div><span>Payment</span><strong>{flow.paymentMode === "inactive" ? "Inactive / Inactivo" : "Historical evidence / Evidencia histórica"}</strong></div>
        <div><span>Custody</span><strong>None / Ninguna</strong></div>
      </div>

      <ol className="payment-flow-viz__steps" aria-label="Payment flow states">
        {flow.stages.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              className={index === activeIndex ? "active" : index < activeIndex ? "visited" : ""}
              aria-current={index === activeIndex ? "step" : undefined}
              onClick={() => setActiveIndex(index)}
            >
              <span>{String(item.order).padStart(2, "0")}</span>
              <strong>{item.title.es}</strong>
              <small>{item.title.en}</small>
            </button>
          </li>
        ))}
      </ol>

      <div className="payment-flow-viz__detail" aria-live="polite">
        <div className="payment-flow-viz__actor">
          <span>ACTOR</span>
          <strong>{stage.actor.toUpperCase()}</strong>
        </div>
        <div>
          <span className={`payment-flow-viz__status status-${stage.status}`}>{status.es} / {status.en}</span>
          <h2>{stage.title.es} / {stage.title.en}</h2>
          <p>{stage.description.es}</p>
          <p lang="en">{stage.description.en}</p>
        </div>
      </div>

      <div className="payment-flow-viz__controls">
        <button type="button" className="ghost" disabled={activeIndex === 0} onClick={() => setActiveIndex((value) => value - 1)}>
          ← Anterior / Previous
        </button>
        <button type="button" className="primary" disabled={activeIndex === flow.stages.length - 1} onClick={() => setActiveIndex((value) => value + 1)}>
          Siguiente estado / Next state →
        </button>
      </div>

      <div className="payment-flow-viz__boundaries">
        <article>
          <span>BUYER / AGENT</span>
          <h3>Decide y autoriza fuera de Bazaar.</h3>
          <p>Aplica allowlists, presupuesto, asset, red y aprobación humana. Una autorización de política no es una firma.</p>
          <p lang="en">Applies allowlists, budget, asset, network, and human approval. Policy authorization is not a signature.</p>
        </article>
        <article>
          <span>PROVIDER + FACILITATOR</span>
          <h3>Desafía, liquida y entrega — cuando esté activo.</h3>
          <p>El provider declara términos y entrega. El facilitator verifica/liquida. Las cards piloto mantienen pago inactivo.</p>
          <p lang="en">The provider declares terms and delivers. The facilitator verifies/settles. Pilot cards keep payment inactive.</p>
        </article>
        <article>
          <span>STELLAR BAZAAR</span>
          <h3>Descubre y explica; no custodia.</h3>
          <p>No guarda fondos, no firma, no ejecuta URLs arbitrarias y no afirma settlement sin reconciliar el receipt.</p>
          <p lang="en">It holds no funds, signs nothing, invokes no arbitrary URLs, and claims no settlement without receipt reconciliation.</p>
        </article>
      </div>
    </section>
  );
}
