"use client";
import { ActivityDashboard } from "./ActivityDashboard";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelContextRegistry } from "@/lib/webmcp/types";

type Locale = "es" | "en";
type Entry = {
  id: string; recordedAt: string; evidence: "agent-reported";
  clientOperationId: string; mode: "fixture" | "mock" | "testnet"; agentId?: string;
  service: { id: string; title: string; provider: string; url: string };
  payment: { status: "not-requested" | "reported-unverified" | "failed" | "unknown"; network: string; asset: string; amountAtomic: string; recipient: string; transactionHash?: string };
  delivery: { status: "pending" | "reported-delivered" | "failed" | "unknown"; result?: unknown };
};
type ViewState = "locked" | "loading" | "ready" | "unauthorized" | "unavailable" | "error";

const copy = {
  es: {
    title: "Lo que tu agente ha preparado", subtitle: "Explora tus entregas y prepara preguntas para conversar con tu agente.",
    catalog: "Catálogo", heading: "Biblioteca privada", token: "Acceso de lectura al historial", unlock: "Consultar historial", lock: "Bloquear y borrar vista", refresh: "Actualizar",
    access: "Introduce únicamente el token de lectura que te proporcionó el operador para tu historial. Se mantiene en memoria durante esta vista. Nunca introduzcas una clave de wallet ni un token de escritura.",
    note: "Este registro muestra lo reportado por tu agente. Un hash declarado no verifica el pago ni la calidad de la entrega. Consultarlo no solicita aprobaciones ni interrumpe al agente.",
    locked: "Historial bloqueado. Introduce tu acceso de lectura para consultar tus operaciones.", loading: "Consultando tus operaciones…", unauthorized: "El acceso de lectura no es válido o ha caducado. Solicita uno válido al operador.", unavailable: "El historial no está habilitado o su almacenamiento no está disponible. El operador debe revisar la configuración; no se muestran datos de ejemplo como compras.", error: "No pudimos consultar el historial. Inténtalo nuevamente.", empty: "Aún no hay operaciones registradas para este acceso. No se reconstruyen compras a partir de transferencias antiguas.",
    provider: "Proveedor", agent: "Agente declarado", unidentified: "No identificado", recorded: "Registrado", payment: "Pago", delivery: "Entrega", recipient: "Destinatario declarado", amount: "Importe declarado (unidades atómicas)", asset: "Activo", network: "Red", result: "Ver resultado reportado", absent: "Sin resultado almacenado", transaction: "Ver transacción declarada en Testnet", evidence: "Reportado por agente · sin verificación independiente", latest: "Últimas 20 operaciones registradas", origin: "Origen declarado", op: "Referencia de operación",
    statuses: { "not-requested": "No solicitado", "reported-unverified": "Reportado · pago no verificado", failed: "Fallo reportado", pending: "Pendiente", unknown: "Desconocido · requiere conciliación", "reported-delivered": "Entrega reportada · no verificada" },
    modes: { fixture: "Fixture de prueba", mock: "Simulación", testnet: "Testnet" },
  },
  en: {
    title: "What your agent consumes", subtitle: "Review its operations, recipients and results in a private history.",
    catalog: "Catalogue", heading: "Operation history", token: "Read-only history access", unlock: "View history", lock: "Lock and clear view", refresh: "Refresh",
    access: "Enter only the read token supplied by the operator for your history. It stays in memory while this view is open. Never enter a wallet key or write token.",
    note: "This journal shows what your agent reported. A declared hash does not verify payment or delivery quality. Reading it requires no purchase approvals and does not interrupt the agent.",
    locked: "History locked. Enter your read access to view your operations.", loading: "Loading your operations…", unauthorized: "Read access is invalid or expired. Request valid access from the operator.", unavailable: "History is disabled or storage is unavailable. The operator must check configuration; example data is not shown as purchases.", error: "History could not be loaded. Please try again.", empty: "No operations have been recorded for this access yet. Purchases are not reconstructed from old transfers.",
    provider: "Provider", agent: "Declared agent", unidentified: "Not identified", recorded: "Recorded", payment: "Payment", delivery: "Delivery", recipient: "Declared recipient", amount: "Declared amount (atomic units)", asset: "Asset", network: "Network", result: "View reported result", absent: "No stored result", transaction: "View declared Testnet transaction", evidence: "Agent-reported · not independently verified", latest: "Latest 20 recorded operations", origin: "Declared origin", op: "Operation reference",
    statuses: { "not-requested": "Not requested", "reported-unverified": "Reported · payment unverified", failed: "Reported failure", pending: "Pending", unknown: "Unknown · reconciliation needed", "reported-delivered": "Reported delivery · unverified" },
    modes: { fixture: "Test fixture", mock: "Simulation", testnet: "Testnet" },
  },
};

const short = (value: string) => value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

export function HistoryAmount({ atomic, asset }: { atomic: string; asset: string }) {
  if ((asset === "USDC" || asset === "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA") && /^\d{1,40}$/.test(atomic)) {
    const value = BigInt(atomic);
    const fraction = (value % 10000000n).toString().padStart(7, "0").replace(/0+$/, "");
    return <span>{`${value / 10000000n}${fraction ? `.${fraction}` : ""} USDC`} <small>({atomic} atomic)</small></span>;
  }
  return <span>{atomic} atomic</span>;
}

export function HistoryResult({ value, label }: { value: unknown; label: string }) {
  return <details><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}

export function OperationHistory() {
  const [locale, setLocale] = useState<Locale>("es");
  const [token, setToken] = useState("");
  const [state, setState] = useState<ViewState>("locked");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [agentAccess, setAgentAccess] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const native = useRef<ModelContextRegistry | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const c = copy[locale];

  useEffect(() => {
    const context = navigator.modelContext;
    if (context && context !== window.modelContext && typeof context.registerTool === "function" && typeof context.unregisterTool === "function") {
      native.current = context; setNativeAvailable(true);
    }
    return () => { generation.current += 1; pending.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!agentAccess || !token.trim() || !native.current) return;
    const context = native.current;
    let connected = true;
    const requests = new Set<AbortController>();
    try {
      context.registerTool({
        name: "bazaar_get_operation_history",
        description: "Read the connected private agent-reported journal. No payment or delivery verification. No token arguments.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async input => {
          const failure = { isError: true, content: [{ type: "text", text: "Private history unavailable or disconnected." }] };
          if (!connected || !input || Object.keys(input).length !== 0) return failure;
          const controller = new AbortController(); requests.add(controller);
          try {
            const response = await fetch("/api/operations?limit=20", { headers: { Authorization: `Bearer ${token.trim()}` }, credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal });
            if (!response.ok || !connected) return failure;
            const data = await response.json();
            if (!connected || data.version !== "1" || !Array.isArray(data.records)) return failure;
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
          } catch { return failure; } finally { requests.delete(controller); }
        },
      });
    } catch { setAgentAccess(false); setNativeAvailable(false); }
    return () => {
      connected = false; requests.forEach(request => request.abort());
      try { context.unregisterTool?.("bazaar_get_operation_history"); } catch { /* The disconnected closure cannot return data. */ }
    };
  }, [agentAccess, token]);

  const lock = useCallback(() => {
    generation.current += 1;
    pending.current?.abort();
    setAgentAccess(false); setToken(""); setEntries([]); setState("locked");
  }, []);

  async function readHistory() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const request = ++generation.current;
    setState("loading"); setEntries([]);
    try {
      const response = await fetch("/api/operations?limit=20", {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: "no-store", credentials: "omit", signal: controller.signal, redirect: "error",
      });
      if (request !== generation.current) return;
      if (!response.ok) {
        setState(response.status === 401 || response.status === 403 ? "unauthorized" : response.status === 503 ? "unavailable" : "error");
        return;
      }
      const body = await response.json();
      if (request !== generation.current) return;
      if (body.version !== "1" || !Array.isArray(body.records)) throw new Error("Invalid history response");
      setEntries(body.records); setState("ready");
    } catch {
      if (request === generation.current && !controller.signal.aborted) setState("error");
    }
  }

  return <main className="operation-history" lang={locale}>
    <nav className="history-nav" aria-label={locale === "es" ? "Navegación" : "Navigation"}>
      <Link href="/" className="brand">✦ Stellar Bazaar <sup>x402</sup></Link>
      <Link href="/catalogo">{c.catalog}</Link>
      <label className="history-locale"><span>Idioma / Language</span><select value={locale} onChange={event => setLocale(event.target.value as Locale)}><option value="es">Español</option><option value="en">English</option></select></label>
    </nav>
    <header><p className="kicker">{c.heading}</p><h1>{c.title}</h1><p>{c.subtitle}</p></header>
    <section className="history-access" aria-label={c.token}>
      <form onSubmit={event => { event.preventDefault(); void readHistory(); }}>
        <label htmlFor="history-access-token">{c.token}</label>
        <input id="history-access-token" type="password" value={token} onChange={event => { generation.current += 1; pending.current?.abort(); setAgentAccess(false); setEntries([]); setState("locked"); setToken(event.target.value); }} autoComplete="off" spellCheck={false} maxLength={512} aria-describedby="history-access-help" />
        <p id="history-access-help">{c.access}</p>
        <div className="history-actions"><button type="submit" disabled={!token.trim() || state === "loading"}>{state === "ready" ? c.refresh : c.unlock}</button><button type="button" onClick={lock}>{c.lock}</button></div>
      </form>
      <details><summary>Conexión del navegador</summary>{nativeAvailable ? <label className="history-agent-access"><input type="checkbox" checked={agentAccess} disabled={!token.trim()} onChange={event => setAgentAccess(event.target.checked)} />{locale === "es" ? "Conectar historial privado al agente del navegador (solo lectura)" : "Connect private history to the browser agent (read-only)"}</label> : <p>{locale === "es" ? "WebMCP nativo no disponible en este navegador. El historial web funciona de forma independiente." : "Native WebMCP is unavailable in this browser. Web history works independently."}</p>}</details>
      {agentAccess && <p role="status">{locale === "es" ? "Agente conectado: puede leer este historial privado hasta bloquear la vista o salir de la página." : "Agent connected: it can read this private history until you lock the view or leave the page."}</p>}
    </section>
    <details className="history-evidence-note"><summary>Cómo interpretar este registro</summary><p>{c.note}</p></details>
    <div role="status" aria-live="polite">{state !== "ready" ? c[state] : entries.length === 0 ? c.empty : c.latest}</div>
    {state === "ready" && <ActivityDashboard token={token.trim()} onUnauthorized={lock} />}
    {state === "ready" && <details><summary>Últimas operaciones · vista técnica</summary><section aria-label={c.heading} className="history-records">{entries.map(entry => <article key={entry.id} className="history-record">
      <div className="history-record-heading"><h2>{entry.service.title}</h2><span className="history-badge">{c.modes[entry.mode]}</span></div>
      <p className="history-evidence-note">{c.evidence}</p>
      <dl><div><dt>{c.provider}</dt><dd>{entry.service.provider}</dd></div><div><dt>{c.agent}</dt><dd>{entry.agentId || c.unidentified}</dd></div><div><dt>{c.recorded}</dt><dd><time dateTime={entry.recordedAt}>{entry.recordedAt}</time></dd></div><div><dt>{c.op}</dt><dd>{entry.clientOperationId}</dd></div><div><dt>{c.origin}</dt><dd>{entry.service.url}</dd></div></dl>
      <div className="history-outcomes"><section><h3>{c.payment}</h3><strong>{c.statuses[entry.payment.status]}</strong><dl><div><dt>{c.amount}</dt><dd><HistoryAmount atomic={entry.payment.amountAtomic} asset={entry.payment.asset} /></dd></div><div><dt>{c.asset}</dt><dd>{entry.payment.asset}</dd></div><div><dt>{c.network}</dt><dd>{entry.payment.network}</dd></div><div><dt>{c.recipient}</dt><dd>{short(entry.payment.recipient)}</dd></div></dl>
        {entry.mode === "testnet" && entry.payment.network === "stellar:testnet" && /^[a-fA-F0-9]{64}$/.test(entry.payment.transactionHash || "") && <a href={`https://stellar.expert/explorer/testnet/tx/${entry.payment.transactionHash}`} target="_blank" rel="noopener noreferrer">{c.transaction} ↗</a>}
      </section><section><h3>{c.delivery}</h3><strong>{c.statuses[entry.delivery.status]}</strong>{entry.delivery.result !== undefined ? <HistoryResult value={entry.delivery.result} label={c.result} /> : <p>{c.absent}</p>}</section></div>
    </article>)}</section></details>}
  </main>;
}
