"use client";

import { useState } from "react";
import { createPrivateRecoveryCapsule, createPublicRecoveryHandoff } from "@/lib/delivery-recovery-handoff";

type Json = Record<string, any>;

function short(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value; }
function randomHex(bytes: number) { return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, "0")).join(""); }
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
async function sha256Hex(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join(""); }
function downloadJson(filename: string, value: unknown) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }

export function WebsiteIntelligenceConsumption() {
  const [view, setView] = useState<"new" | "evidence">("new");
  const [inspection, setInspection] = useState<Json | null>(null);
  const [delivery, setDelivery] = useState<Json | null>(null);
  const [busy, setBusy] = useState<"inspect" | "delivery" | null>(null);
  const [message, setMessage] = useState("");
  const [handoff, setHandoff] = useState<Json | null>(null);
  const [capsule, setCapsule] = useState<Json | null>(null);

  async function inspect() {
    setBusy("inspect"); setMessage(""); setInspection(null); setHandoff(null); setCapsule(null);
    try {
      const requestId = randomHex(16);
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const recoveryToken = base64Url(tokenBytes);
      const recoveryProof = await sha256Hex(recoveryToken);
      const response = await fetch("/api/buyer-execution/website-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://example.com", language: "es", requestId, recoveryProof }) });
      const data = await response.json(); setInspection(data);
      if (response.status === 402 && data.recovery?.proofCommitted === true) {
        const providerOrigin = new URL(String(data.service.endpoint)).origin;
        setHandoff(createPublicRecoveryHandoff({ serviceId: String(data.service.id), providerOrigin, paidPath: "/v1/x402/audits", recoveryPath: String(data.recovery.recoveryPath), requestId, recoveryProof, inputHash: String(data.request.inputHash), idempotencyKey: String(data.request.idempotencyKey) }));
        setCapsule(createPrivateRecoveryCapsule({ serviceId: String(data.service.id), providerOrigin, recoveryPath: String(data.recovery.recoveryPath), requestId, recoveryToken }));
      }
      if (response.status !== 402) setMessage("No fue posible confirmar el challenge 402 público.");
    } catch { setMessage("Proveedor no disponible; intenta más tarde. / Provider unavailable; try again later."); }
    finally { setBusy(null); }
  }

  async function recoverDelivery() {
    setBusy("delivery"); setMessage("");
    try {
      const response = await fetch("/api/buyer-execution/website-intelligence", { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(); setDelivery(data);
    } catch { setMessage("No fue posible cargar la evidencia. / Evidence could not be loaded."); }
    finally { setBusy(null); }
  }

  async function copyResult() {
    if (!delivery) return;
    await navigator.clipboard.writeText(JSON.stringify(delivery.result, null, 2));
    setMessage("Resultado copiado / Result copied");
  }

  function downloadResult() {
    if (!delivery) return;
    downloadJson("website-intelligence-verified-delivery.json", delivery);
  }

  const stage = delivery ? 5 : inspection ? 2 : 1;
  const findings = Array.isArray(delivery?.result?.findings) ? delivery.result.findings as Json[] : [];

  return <section className="buyer-execution real-consumption" id="website-intelligence" aria-labelledby="website-intelligence-title">
    <div className="buyer-execution__notice real">TESTNET REAL VERIFICADO / VERIFIED · PROVEEDOR EXTERNO / EXTERNAL PROVIDER · SIN CUSTODIA / NON-CUSTODIAL · NO SE EJECUTA UN NUEVO PAGO EN ESTA VISTA</div>
    <header className="buyer-execution__header"><div><span className="kicker">WEBSITE INTELLIGENCE · DELIVERY WORKSPACE v1</span><h1 id="website-intelligence-title">Compra, recibe y comprueba el servicio.</h1><p lang="en">Purchase, receive, and verify the service.</p></div><div className="buyer-execution__scope"><strong>Alcance actual / Current scope</strong><span>Compra nueva: inspección y handoff externo</span><span lang="en">New purchase: inspection and external handoff</span><span>Evidencia: 1 entrega Testnet recuperable</span></div></header>
    <div className="buyer-execution__services" role="group" aria-label="Modo del workspace / Workspace mode"><button type="button" aria-pressed={view === "new"} className={view === "new" ? "active" : ""} onClick={() => { setView("new"); setDelivery(null); }}><strong>Preparar compra nueva</strong><span lang="en">Prepare a new purchase</span><small>NO FIRMA / NO CHARGE</small></button><button type="button" aria-pressed={view === "evidence"} className={view === "evidence" ? "active" : ""} onClick={() => { setView("evidence"); setInspection(null); setHandoff(null); setCapsule(null); }}><strong>Ver compra ya validada</strong><span lang="en">View verified purchase</span><small>HISTORICAL EVIDENCE</small></button></div>
    <ol className="buyer-execution__steps" aria-label="Estado de entrega / Delivery state"><li className={stage >= 1 ? "active" : ""} aria-current={stage === 1 ? "step" : undefined}><b>01</b><span>Ficha</span><small>Service card</small></li><li className={stage >= 2 ? "active" : ""} aria-current={stage === 2 ? "step" : undefined}><b>02</b><span>402 recibido</span><small>Terms inspected</small></li><li className={stage >= 3 ? "active" : ""}><b>03</b><span>Pago liquidado</span><small>Buyer client</small></li><li className={stage >= 4 ? "active" : ""}><b>04</b><span>Entregado</span><small>Provider result</small></li><li className={stage >= 5 ? "active" : ""} aria-current={stage === 5 ? "step" : undefined}><b>05</b><span>Reconciliado</span><small>Receipt + result</small></li></ol>
    <div className="buyer-execution__grid"><div className="buyer-execution__form"><h2>{view === "new" ? "Preparar solicitud / Prepare request" : "Recuperar evidencia / Recover evidence"}</h2><p>{view === "new" ? <>Entrada permitida para esta prueba: <code>https://example.com</code></> : "Carga el resultado y el recibo de una compra Testnet ya ejecutada."}</p><div className="buyer-execution__contract"><span>{view === "new" ? "TÉRMINOS ANTES DE AUTORIZAR / PRE-AUTH TERMS" : "EVIDENCIA HISTÓRICA / HISTORICAL EVIDENCE"}</span><strong>0.001 USDC · exact · Stellar Testnet</strong><small>{view === "new" ? "POST /v1/x402/audits · provider-owned result · buyer-controlled signer" : "El endpoint de esta demo devuelve un sobre fijo, no una compra privada por tx hash."}</small></div><div className="buyer-execution__actions">{view === "new" ? <button type="button" className="primary" onClick={inspect} disabled={busy !== null}>{busy === "inspect" ? "Inspeccionando…" : "1. Inspeccionar términos 402"}</button> : <button type="button" className="primary" onClick={recoverDelivery} disabled={busy !== null}>{busy === "delivery" ? "Recuperando…" : "Recuperar entrega validada"}</button>}</div>{view === "new" && inspection && <div className="buyer-execution__handoff"><strong>2. Autoriza fuera de Bazaar / Authorize outside Bazaar</strong><p>Usa un cliente controlado por el comprador. Bazaar no recibe la seed ni puede ejecutar el pago desde esta pantalla.</p><p lang="en">Use a buyer-controlled client. Bazaar never receives the seed and cannot execute the payment from this screen.</p><code>cardHash + inputHash + method + route + amount + payTo</code>{handoff && capsule && <><div className="buyer-execution__actions"><button type="button" className="ghost" onClick={() => downloadJson("website-intelligence-buyer-handoff.json", handoff)}>Descargar paquete para mi cliente / Download buyer handoff</button><button type="button" className="ghost" onClick={() => downloadJson("website-intelligence-recovery-secret.json", capsule)}>Guardar credencial de recuperación / Save recovery credential</button><button type="button" className="ghost" onClick={() => { setCapsule(null); setMessage("Credencial borrada de memoria / Credential cleared from memory"); }}>Borrar credencial de memoria / Clear credential</button></div><p role="note"><strong>Secreto del comprador:</strong> guarda la credencial como una contraseña. Bazaar no la envía a su servidor, no la persiste y no puede recuperarla.</p><p lang="en">Buyer secret: store the credential like a password. Bazaar does not send or persist it and cannot restore it.</p></>}</div>}{message && <p role="status">{message}</p>}</div>
      <section className="buyer-execution__output" aria-live="polite" aria-busy={busy !== null}><div className="terminal-head"><span/><span/><span/><code>{delivery ? "verified-delivery.json" : "payment-inspection.json"}</code></div><pre>{JSON.stringify(delivery ?? inspection ?? { status: "ready", paymentPerformedByThisView: false, next: "Inspect the public 402 or recover the verified delivery." }, null, 2)}</pre></section></div>
    {inspection && <div className="buyer-execution__delivered"><article><span>CHALLENGE 402</span><strong>{inspection.status === "payment-required" ? "Contrato público confirmado" : "Inspección incompleta"}</strong><p>{inspection.payment ? `${inspection.payment.displayAmount} · ${inspection.payment.network} · payTo ${short(inspection.payment.payTo)}` : "Sin términos verificados"}</p></article><article><span>AUTORIZACIÓN / AUTHORIZATION</span><strong>Controlada por el comprador</strong><p>Bazaar no recibe una seed ni firma. El cliente del comprador usa el mismo cardHash e inputHash inspeccionados.</p></article></div>}
    {delivery && <><div className="buyer-execution__delivered"><article><span>RESULTADO UTILIZABLE / USABLE RESULT</span><strong>{delivery.result.summary}</strong><p>Score {delivery.result.score}/100 · {findings.length} hallazgos · hash {short(delivery.resultHash)}</p></article><article><span>EVIDENCIA TESTNET REGISTRADA / RECORDED TESTNET EVIDENCE</span><strong>{delivery.payment.displayAmount} · ledger {delivery.payment.ledger}</strong><p>Tx {short(delivery.payment.transactionHash)} · integridad del resultado comprobada localmente; el ledger no se revalida en esta vista.</p><p lang="en">Result integrity is checked locally; this view does not revalidate the ledger.</p><a href={delivery.payment.explorerUrl} target="_blank" rel="noreferrer">Abrir en Stellar Expert / Open ↗</a></article></div><section className="buyer-execution__findings" aria-labelledby="findings-title"><h2 id="findings-title">Qué recibió el comprador / What the buyer received</h2><p>Informe en español solicitado al proveedor; se puede copiar, descargar y verificar por hash.</p><p lang="en">Spanish-language provider output; it can be copied, downloaded, and hash-checked.</p><div>{findings.map((finding) => <article key={String(finding.id)}><span>{String(finding.category)} · {String(finding.severity)}</span><strong>{String(finding.title)}</strong><p>{String(finding.detail)}</p><code>{String(finding.evidence)}</code></article>)}</div></section><div className="buyer-execution__actions"><button type="button" className="ghost" onClick={copyResult}>Copiar resultado / Copy result</button><button type="button" className="ghost" onClick={downloadResult}>Descargar sobre completo / Download envelope</button></div></>}
    <aside className="buyer-execution__boundary"><strong>Esta vista demuestra consumo y recuperación de una compra Testnet ya ejecutada; no vuelve a cobrar.</strong><strong lang="en">This view demonstrates consumption and recovery of an existing Testnet purchase; it does not charge again.</strong><p>Para una compra nueva, el comprador autoriza desde su propio cliente. Bazaar no almacena seeds, no custodia fondos y no certifica la calidad del informe.</p></aside>
  </section>;
}
