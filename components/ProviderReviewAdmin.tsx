"use client";

import { useEffect, useRef, useState } from "react";
import type { ProviderSubmission } from "@/lib/provider-self-listing";

type Session = { operator: { email: string }; csrfToken: string; expiresAt: number };
type Queue = { submissions: ProviderSubmission[]; page: number; totalPages: number; total: number };
const panel = { padding: "1.25rem", border: "1px solid #cbd5e1", background: "#ffffff", color: "#172033", borderRadius: 12, marginBottom: "1rem", minWidth: 0, overflowWrap: "anywhere" as const };
const field = { width: "100%", minHeight: 44, padding: ".75rem", margin: ".5rem 0", color: "#172033", background: "#ffffff", border: "1px solid #64748b", borderRadius: 6 };
const buttonStyle = { minHeight: 44, maxWidth: "100%", padding: ".65rem 1rem", border: "1px solid #64748b", borderRadius: 6, color: "#172033", background: "#f1f5f9", whiteSpace: "normal" as const, overflowWrap: "anywhere" as const };

export function SubmissionDetails({ submission }: { submission: ProviderSubmission }) {
  return <div style={panel}>
    <h3>{submission.card.name}</h3><p>{submission.submissionId} · {submission.status}</p>
    <p>{submission.publiclyActive ? "Públicamente activo" : ["activation-pending", "activation-uncertain"].includes(submission.status) ? "Publicación sin confirmar. Requiere reconciliación." : "No está publicado"}</p>
    <p>Control: {submission.control.method} · {submission.control.domain} · {submission.control.status}</p>
    <p>Recibido: {submission.submittedAt} · Expira: {submission.expiresAt}</p>
    <details open><summary style={{ minHeight: 44, padding: ".75rem 0", cursor: "pointer" }}>Ficha y evidencia</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#172033", background: "#f8fafc", padding: ".75rem", fontSize: ".875rem" }}>{JSON.stringify({ card: submission.card, control: submission.control, conformance: submission.conformance, review: submission.review, activation: submission.activation }, null, 2)}</pre></details>
  </div>;
}

export function ProviderReviewAdmin() {
  const [session, setSession] = useState<Session | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [selected, setSelected] = useState<ProviderSubmission | null>(null);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const initialToken = useRef<string | null | undefined>(undefined);

  function clearPrivate() { setSession(null); setQueue(null); setSelected(null); setReason(""); }
  async function request(path: string, init: RequestInit, controller: AbortController) {
    const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", signal: controller.signal });
    if (controller.signal.aborted) throw new Error("ABORTED");
    if (response.status === 401 || response.status === 403) {
      clearPrivate();
      throw new Error("Sesión no válida. Solicita un nuevo enlace de acceso.");
    }
    const data = await response.json();
    if (controller.signal.aborted) throw new Error("ABORTED");
    if (!response.ok || data.ok === false) throw new Error(data.error?.code || "No se pudo completar la operación.");
    return data;
  }
  async function run(operation: (controller: AbortController) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    const version = ++generation.current; setBusy(true); setMessage("");
    try { await Promise.resolve(); if (!controller.signal.aborted) await operation(controller); }
    catch (error) { if (!controller.signal.aborted && version === generation.current) setMessage(error instanceof Error ? error.message : "Error de conexión."); }
    finally { if (version === generation.current) { active.current = null; setBusy(false); } }
  }
  async function loadQueue(controller: AbortController, page = 1) {
    const data = await request(`/api/admin/provider-submissions?page=${page}&pageSize=20`, {}, controller);
    setQueue(data.value);
  }
  useEffect(() => {
    // Capture once, including under StrictMode's setup/cleanup replay; never persist the credential.
    if (initialToken.current === undefined) {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      initialToken.current = hash.get("key");
      if (hash.has("key")) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    void run(async controller => {
      const token = initialToken.current;
      initialToken.current = null;
      const data = await request("/api/admin/review-session", token ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) } : {}, controller);
      setSession(data); await loadQueue(controller);
    });
    return () => { active.current?.abort(); active.current = null; generation.current++; };
    // The bootstrap runs only when the review surface mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      active.current?.abort(); active.current = null; generation.current++;
      clearPrivate(); setBusy(false); setMessage("La sesión expiró. Solicita un nuevo enlace de acceso.");
    }, Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);

  async function action(name: string, decision?: "approve" | "reject") {
    if (!session || !selected) return;
    await run(async controller => {
      // Drop the previous action state before a write: a lost response may still have committed.
      // Reopening the queue item fetches authoritative status before offering another action.
      setSelected(null);
      const data = await request(`/api/admin/provider-submissions/${encodeURIComponent(selected.submissionId)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ action: name, ...(decision ? { decision, reasons: [reason.trim()] } : {}) }),
      }, controller);
      setSelected(data.value); setReason(""); await loadQueue(controller, queue?.page || 1); setMessage("Operación completada.");
    });
  }
  return <section aria-labelledby="provider-review-title" style={{ color: "#172033" }}>
    <h1 id="provider-review-title">Revisión de proveedores</h1>
    <p>Verifica el control, registra una decisión, prepara y activa en pasos separados. Aprobar o preparar no publica la ficha.</p>
    <p role="status" aria-live="polite">{busy ? "Procesando…" : message}</p>
    {!session ? <form style={panel} onSubmit={event => { event.preventDefault(); void run(async controller => {
      await request("/api/admin/magic-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }, controller);
      setMessage("Si el correo está autorizado, recibirás un enlace de acceso.");
    }); }}>
      <h2>Acceso de operador</h2><label htmlFor="review-email">Correo autorizado</label>
      <input id="review-email" style={field} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
      <button style={buttonStyle} type="submit" disabled={busy}>Solicitar enlace de acceso</button>
    </form> : <>
      <div style={panel}><p>{session.operator.email} · Sesión hasta {new Date(session.expiresAt).toLocaleString()}</p>
        <button style={buttonStyle} onClick={() => { const csrfToken = session.csrfToken; active.current?.abort(); active.current = null; generation.current++; clearPrivate(); void run(async controller => {
          await request("/api/admin/review-session", { method: "DELETE", headers: { "x-csrf-token": csrfToken } }, controller); setMessage("Sesión cerrada.");
        }); }}>Cerrar sesión</button>
      </div>
      <div style={panel}><h2>Cola de revisión ({queue?.total ?? 0})</h2>
        <button style={buttonStyle} disabled={busy} onClick={() => void run(controller => loadQueue(controller, queue?.page || 1))}>Actualizar cola</button>
        {queue?.submissions.length === 0 && <p>No hay solicitudes.</p>}
        <ul>{queue?.submissions.map(item => <li key={item.submissionId} style={{ margin: "1rem 0" }}>
          <button style={buttonStyle} disabled={busy} onClick={() => void run(async controller => {
            setSelected(null); setReason(""); const data = await request(`/api/admin/provider-submissions/${encodeURIComponent(item.submissionId)}`, {}, controller); setSelected(data.value);
          })}>{item.card.name} · {item.status}</button>
        </li>)}</ul>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button style={buttonStyle} disabled={busy || !queue || queue.page <= 1} onClick={() => void run(controller => loadQueue(controller, queue!.page - 1))}>Anterior</button>
          <span>Página {queue?.page || 1} de {queue?.totalPages || 1}</span>
          <button style={buttonStyle} disabled={busy || !queue || queue.page >= queue.totalPages} onClick={() => void run(controller => loadQueue(controller, queue!.page + 1))}>Siguiente</button>
        </div>
      </div>
      {selected && <><SubmissionDetails submission={selected} /><fieldset disabled={busy} style={panel}>
        <legend>Acciones explícitas</legend>
        {selected.status === "awaiting-control-proof" && <button style={buttonStyle} onClick={() => void action(selected.control.method === "dns-txt" ? "verify-dns" : "verify-http")}>Verificar control ({selected.control.method})</button>}
        {selected.status === "pending-manual-review" && <><label htmlFor="review-reason">Motivo de la decisión (obligatorio)</label><textarea id="review-reason" style={field} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /><button style={buttonStyle} disabled={busy || !reason.trim()} onClick={() => void action("review", "approve")}>Aprobar para preparación</button>{" "}<button style={buttonStyle} disabled={busy || !reason.trim()} onClick={() => void action("review", "reject")}>Rechazar</button></>}
        {selected.status === "approved-for-staging" && <button style={buttonStyle} onClick={() => void action("stage")}>Preparar sin publicar</button>}
        {selected.status === "staged-not-public" && <><p>Activar publica esta ficha en el registro. Comprueba la evidencia antes de continuar.</p><button style={buttonStyle} onClick={() => void action("activate")}>Activar y publicar</button></>}
        {["activation-pending", "activation-uncertain"].includes(selected.status) && <button style={buttonStyle} onClick={() => void action("recover")}>Reconciliar activación</button>}
      </fieldset></>}
    </>}
  </section>;
}


