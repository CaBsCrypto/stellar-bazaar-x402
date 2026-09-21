"use client";
import { useCallback, useState, useRef, useEffect, type ReactNode } from "react";
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
import {Modal} from "./ui/Modal";
import {Button} from "./ui";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export function DeliverableReview({accessEntry}: {accessEntry?: ReactNode} = {}) {
  const [selected, setSelected] = useState(0),
    delivery = reviewDeliveries[selected];
  const [selectorOpen,setSelectorOpen]=useState(false);
  const [selectionKey,setSelectionKey]=useState(0);
  const workspace=useRef<HTMLDivElement>(null);
  function choose(index:number){setSelected(index);setSelectionKey(n=>n+1);setSelectorOpen(false);}
  useEffect(()=>{if(selectionKey>0){const frame=requestAnimationFrame(()=>workspace.current?.querySelector<HTMLElement>(".delivery-header h2")?.focus());return ()=>cancelAnimationFrame(frame);}},[selectionKey]);
  const cards=<div className="library-cards">{reviewDeliveries.map((item,i)=><button key={item.manifest.versionId} aria-pressed={selected===i} onClick={()=>choose(i)}><span className={"type-icon "+item.manifest.content.kind}>{icons[item.manifest.content.kind]}</span><span><small>{labels[item.manifest.content.kind]}</small><strong>{item.manifest.title}</strong></span></button>)}</div>;
  const access: FileAccess = useCallback(async (file) => {
    const url = reviewFilePaths[file.id] || "";
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <main className="delivery-library shell" style={{ flex: 1, paddingBottom: "4rem" }}>
        <header className="library-header" style={{ paddingTop: "0.5rem" }}>
        <span className="ui-pill ui-pill--warning">Demostración · datos de ejemplo</span>
        <h1>Así se verá tu biblioteca</h1>
        <p>Tu agente te compartirá un enlace privado para abrir tus propias entregas.</p>
        {accessEntry}
      </header>
      <div className="library-layout">
        <aside className="library-sidebar"><h2>Entregas <span>04</span></h2>{cards}</aside>
        <div className="library-mobile-selector"><div><small>Entrega actual</small><strong>{delivery.manifest.title}</strong></div><Button variant="secondary" onClick={()=>setSelectorOpen(true)}>Cambiar entrega</Button></div>
        <Modal open={selectorOpen} onClose={()=>setSelectorOpen(false)} title="Cambiar entrega">{cards}</Modal>
        <div ref={workspace} className="library-workspace">
        <PurchaseWorkspace
          publicExample
          key={delivery.manifest.versionId+selectionKey}
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
      </div>
    </main>
    <Footer />
  </div>
  );
}
