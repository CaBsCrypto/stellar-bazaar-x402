"use client";
import { useCallback, useState } from "react";
import {
  reviewDeliveries,
  reviewEvents,
  reviewFilePaths,
} from "@/lib/review-deliveries";
import {
  PurchaseWorkspace,
  type FileAccess,
  type PurchaseRecord,
} from "./DeliverableViewer";
const labels = {
  script: "Guion",
  video: "Video",
  gallery: "Afiches",
  report: "Informe",
  other: "Archivos",
};
const icons = {
  script: "Aa",
  video: "▶",
  gallery: "◈",
  report: "≡",
  other: "↓",
};
export function DeliverableReview() {
  const [selected, setSelected] = useState(0),
    delivery = reviewDeliveries[selected];
  const access: FileAccess = useCallback(async (file) => {
    const url = reviewFilePaths[file.id];
    if (!url) throw Error();
    return { url };
  }, []);
  const record: PurchaseRecord = {
    id: delivery.operationId,
    clientOperationId: delivery.operationId,
    mode: "mock",
    recordedAt: delivery.createdAt,
    service: {
      id: delivery.manifest.deliveryId,
      title: delivery.manifest.title,
      provider: "Estudio de demostración",
      url: "https://example.com",
    },
    payment: {
      status: "not-requested",
      network: "stellar:testnet",
      asset: "USDC",
      amountAtomic: "0",
      recipient: "G" + "A".repeat(55),
    },
    delivery: { status: "reported-delivered" },
  };
  return (
    <main className="delivery-library">
      <nav className="library-nav">
        <a href="/history">
          ✦ Stellar Bazaar <small>x402</small>
        </a>
        <a href="/history">Mi historial ↗</a>
      </nav>
      <header className="library-header">
        <p className="library-eyebrow">TU AGENTE CREA. TÚ EXPLORAS.</p>
        <h1>
          Tu biblioteca de entregas<span>.</span>
        </h1>
        <p>
          Guiones que puedes recorrer. Videos que puedes reproducir.
          <br />
          Ideas que ya tienen forma.
        </p>
        <div className="review-banner">
          <span className="review-dot" /> Espacio de revisión · cuatro ejemplos
          ficticios · ningún pago realizado
        </div>
      </header>
      <div className="library-layout">
        <aside className="library-sidebar">
          <h2>
            Entregas <span>04</span>
          </h2>
          <div className="library-cards">
            {reviewDeliveries.map((item, i) => (
              <button
                key={item.manifest.versionId}
                className={selected === i ? "selected" : ""}
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
              >
                <span className={"type-icon " + item.manifest.content.kind}>
                  {icons[item.manifest.content.kind]}
                </span>
                <span>
                  <small>{labels[item.manifest.content.kind]} · V1</small>
                  <strong>{item.manifest.title}</strong>
                  <em>
                    {item.manifest.files.length
                      ? item.manifest.files.length + " archivos"
                      : "Contenido estructurado"}
                  </em>
                </span>
                <b>↗</b>
              </button>
            ))}
          </div>
          <p className="library-footnote">
            Las entregas reales se guardan en tu biblioteca privada. Estos
            ejemplos son públicos y solo sirven para revisar la experiencia.
          </p>
        </aside>
        <PurchaseWorkspace
          key={delivery.manifest.versionId}
          record={record}
          versions={[delivery]}
          selected={0}
          onVersion={() => {}}
          access={access}
          onDownload={(file) => {
            const link = document.createElement("a");
            link.href = reviewFilePaths[file.id];
            link.download = file.name;
            link.click();
          }}
          events={reviewEvents(delivery)}
          legacy={null}
        />
      </div>
    </main>
  );
}
