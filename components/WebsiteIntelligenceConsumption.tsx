"use client";

import { useState } from "react";

type Json = Record<string, any>;

function short(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value; }

export function WebsiteIntelligenceConsumption() {
  const [inspection, setInspection] = useState<Json | null>(null);
  const [delivery, setDelivery] = useState<Json | null>(null);
  const [busy, setBusy] = useState<"inspect" | "delivery" | null>(null);
  const [message, setMessage] = useState("");

  async function inspect() {
    setBusy("inspect"); setMessage("");
    try {
      const response = await fetch("/api/buyer-execution/website-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://example.com", language: "es" }) });
      const data = await response.json(); setInspection(data);
      if (response.status !== 402) setMessage("No fue posible confirmar el challenge 402 público.");
    } catch { setMessage("El proveedor público no está disponible temporalmente."); }
    finally { setBusy(null); }
  }

  async function recoverDelivery() {
    setBusy("delivery"); setMessage("");
    try {
      const response = await fetch("/api/buyer-execution/website-intelligence", { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(); setDelivery(data);
    } catch { setMessage("No fue posible cargar la evidencia verificada."); }
    finally { setBusy(null); }
  }

  async function copyResult() {
    if (!delivery) return;
    await navigator.clipboard.writeText(JSON.stringify(delivery.result, null, 2));
    setMessage("Resultado copiado / Result copied");
  }

  function downloadResult() {
    if (!delivery) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(delivery, null, 2)], { type: "application/json" }));
    link.download = "website-intelligence-verified-delivery.json";
    link.click(); URL.revokeObjectURL(link.href);
  }

  return <section className="buyer-execution real-consumption" id="website-intelligence" aria-labelledby="website-intelligence-title">
    <div className="buyer-execution__notice real">TESTNET REAL VERIFICADO / VERIFIED · PROVEEDOR EXTERNO / EXTERNAL PROVIDER · SIN CUSTODIA / NON-CUSTODIAL · NO SE EJECUTA UN NUEVO PAGO EN ESTA VISTA</div>
    <header className="buyer-execution__header"><div><span className="kicker">WEBSITE INTELLIGENCE · BUYER WORKSPACE v1</span><h1 id="website-intelligence-title">Inspecciona, recupera y usa la entrega.</h1><p lang="en">Inspect, recover, and use the delivered result.</p></div><div className="buyer-execution__scope"><strong>Estado / Current state</strong><span>1 compra Testnet reconciliada</span><span lang="en">1 reconciled Testnet purchase</span></div></header>
    <ol className="buyer-execution__steps"><li className="active"><b>01</b><span>Ficha</span><small>Service card</small></li><li className={inspection ? "active" : ""}><b>02</b><span>402 real</span><small>Inspect</small></li><li className="active"><b>03</b><span>Firma externa</span><small>Buyer-controlled</small></li><li className={delivery ? "active" : ""}><b>04</b><span>Resultado</span><small>Delivery</small></li><li className={delivery ? "active" : ""}><b>05</b><span>Recibo</span><small>Reconcile</small></li></ol>
    <div className="buyer-execution__grid"><div className="buyer-execution__form"><h2>Auditoría de sitio / Website audit</h2><p>Fixture público permitido: <code>https://example.com</code></p><div className="buyer-execution__contract"><span>CONTRATO ACTIVO / ACTIVE CONTRACT</span><strong>0.001 USDC · exact · Stellar Testnet</strong><small>El proveedor ejecuta un fixture determinista; no navega el sitio indicado.</small></div><div className="buyer-execution__actions"><button type="button" className="ghost" onClick={inspect} disabled={busy !== null}>{busy === "inspect" ? "Inspeccionando…" : "Inspeccionar 402 real"}</button><button type="button" className="primary" onClick={recoverDelivery} disabled={busy !== null}>{busy === "delivery" ? "Recuperando…" : "Ver entrega validada"}</button></div>{message && <p role="status">{message}</p>}</div>
      <section className="buyer-execution__output" aria-live="polite" aria-busy={busy !== null}><div className="terminal-head"><span/><span/><span/><code>{delivery ? "verified-delivery.json" : "payment-inspection.json"}</code></div><pre>{JSON.stringify(delivery ?? inspection ?? { status: "ready", paymentPerformedByThisView: false, next: "Inspect the public 402 or recover the verified delivery." }, null, 2)}</pre></section></div>
    {inspection && <div className="buyer-execution__delivered"><article><span>CHALLENGE 402</span><strong>{inspection.status === "payment-required" ? "Contrato público confirmado" : "Inspección incompleta"}</strong><p>{inspection.payment ? `${inspection.payment.displayAmount} · ${inspection.payment.network} · payTo ${short(inspection.payment.payTo)}` : "Sin términos verificados"}</p></article><article><span>AUTORIZACIÓN / AUTHORIZATION</span><strong>Controlada por el comprador</strong><p>Bazaar no recibe una seed ni firma. El cliente del comprador usa el mismo cardHash e inputHash inspeccionados.</p></article></div>}
    {delivery && <><div className="buyer-execution__delivered"><article><span>RESULTADO UTILIZABLE / USABLE RESULT</span><strong>{delivery.result.summary}</strong><p>Score {delivery.result.score}/100 · {delivery.result.findings.length} hallazgos · hash {short(delivery.resultHash)}</p></article><article><span>RECIBO RECONCILIADO</span><strong>{delivery.payment.displayAmount} · ledger {delivery.payment.ledger}</strong><p>Tx {short(delivery.payment.transactionHash)} · recuperación durable verificada.</p><a href={delivery.payment.explorerUrl} target="_blank" rel="noreferrer">Abrir en Stellar Expert ↗</a></article></div><div className="buyer-execution__actions"><button type="button" className="ghost" onClick={copyResult}>Copiar resultado / Copy</button><button type="button" className="ghost" onClick={downloadResult}>Descargar evidencia JSON / Download</button></div></>}
    <aside className="buyer-execution__boundary"><strong>Esta vista demuestra consumo y recuperación de una compra Testnet ya ejecutada; no vuelve a cobrar.</strong><strong lang="en">This view demonstrates consumption and recovery of an existing Testnet purchase; it does not charge again.</strong><p>Para una compra nueva, el comprador autoriza desde su propio cliente. Bazaar no almacena seeds, no custodia fondos y no certifica la calidad del informe.</p></aside>
  </section>;
}
