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

import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";

export function OperationHistory() {
  const [locale, setLocale] = useState<Locale>("es");
  const [token, setToken] = useState("");
  const [state, setState] = useState<ViewState>("locked");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [agentAccess, setAgentAccess] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const native = useRef<ModelContextRegistry | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const c = copy[locale];

  useEffect(() => {
    const context = navigator.modelContext;
    if (context && context !== window.modelContext && typeof context.registerTool === "function" && typeof context.unregisterTool === "function") {
      native.current = context; setNativeAvailable(true);
    }

    // Auto-detect magic link token in URL hash (e.g. #token=bz_read_... or ?token=...)
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const searchParams = new URLSearchParams(window.location.search);
      const urlToken = hashParams.get("token") || searchParams.get("token");
      if (urlToken && /^[a-zA-Z0-9_-]{32,128}$/.test(urlToken.trim())) {
        const clean = urlToken.trim();
        setToken(clean);
        void (async () => {
          const controller = new AbortController();
          pending.current = controller;
          const request = ++generation.current;
          setState("loading"); setEntries([]);
          try {
            const response = await fetch("/api/operations?limit=20", {
              headers: { Authorization: `Bearer ${clean}` },
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
        })();
      }
    } catch { /* URL parsing error fallback */ }

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
    if (!token.trim()) return;
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

  const pasteToken = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const clean = text.trim();
        setToken(clean);
      }
    } catch {}
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main className="operation-history shell" lang={locale} style={{ flex: 1, paddingBottom: "4rem" }}>
        <Breadcrumbs
          items={[{ label: "Mi Historial Privado" }]}
          backHref="/catalogo"
          backLabel="← Volver al Catálogo"
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/history/review"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "var(--white)",
                  border: "1px solid var(--line)",
                  color: "var(--violet)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                👁️ Ver Demo de Entregables
              </Link>
              <Link
                href="/agent-chat"
                style={{
                  fontSize: "0.8rem",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: "var(--white)",
                  border: "1px solid var(--line)",
                  color: "var(--mint)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                💬 Agent Chat
              </Link>
            </div>
          }
        />

        <header style={{ marginTop: "1rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <span className="kicker" style={{ margin: 0 }}>
              🔒 {c.heading.toUpperCase()} · CLOUDFLARE R2 & STELLAR TESTNET
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Idioma:</label>
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  background: "var(--white)",
                  color: "var(--ink)",
                  border: "1px solid var(--line)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <h1 style={{ marginTop: "12px", marginBottom: "8px" }}>{c.title}</h1>
          <p style={{ color: "var(--muted)", fontSize: "1.05rem", maxWidth: "750px", margin: 0 }}>
            {c.subtitle}
          </p>
        </header>

        {/* Security / Token Card */}
        <section
          className="history-access"
          style={{
            background: "var(--surface-violet)",
            border: "1px solid var(--line)",
            borderRadius: "16px",
            padding: "clamp(1.2rem, 3vw, 2rem)",
            boxShadow: "none",
            marginBottom: "2rem",
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void readHistory();
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
              <label htmlFor="history-access-token" style={{ fontWeight: 700, color: "var(--ink)", fontSize: "0.95rem" }}>
                🔑 {c.token}
              </label>
              <button
                type="button"
                onClick={pasteToken}
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--line)",
                  color: "var(--violet)",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                📋 Pegar Token
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: "12px" }}>
              <input
                id="history-access-token"
                type="password"
                placeholder="Ej. bz_read_7a9f4c82b01e3d..."
                value={token}
                onChange={(event) => {
                  generation.current += 1;
                  pending.current?.abort();
                  setAgentAccess(false);
                  setEntries([]);
                  setState("locked");
                  setToken(event.target.value);
                }}
                autoComplete="off"
                spellCheck={false}
                maxLength={512}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--white)",
                  border: "1px solid var(--line)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  color: "var(--ink)",
                  fontSize: "0.95rem",
                  fontFamily: "monospace",
                }}
              />
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.5, margin: "0 0 16px 0" }}>
              💡 {c.access}
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="submit"
                disabled={!token.trim() || state === "loading"}
                style={{
                  padding: "10px 22px",
                  borderRadius: "10px",
                  background: "var(--violet)",
                  color: "var(--white)",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  boxShadow: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {state === "loading" ? "⏳ Consultando…" : state === "ready" ? `🔄 ${c.refresh}` : `🔓 ${c.unlock}`}
              </button>

              {token.trim() && (
                <button
                  type="button"
                  onClick={lock}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "10px",
                    background: "var(--white)",
                    color: "var(--amber)",
                    border: "1px solid var(--line)",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    cursor: "pointer",
                  }}
                >
                  🔒 {c.lock}
                </button>
              )}
            </div>
          </form>

          <details style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
            <summary style={{ cursor: "pointer", color: "var(--violet)", fontSize: "0.85rem", fontWeight: 600 }}>
              ⚙️ Conexión nativa del navegador (WebMCP)
            </summary>
            <div style={{ marginTop: "10px" }}>
              {nativeAvailable ? (
                <label className="history-agent-access" style={{ display: "flex", gap: "10px", alignItems: "center", color: "var(--ink)", fontSize: "0.88rem" }}>
                  <input
                    type="checkbox"
                    checked={agentAccess}
                    disabled={!token.trim()}
                    onChange={(event) => setAgentAccess(event.target.checked)}
                  />
                  {locale === "es"
                    ? "Conectar historial privado al agente del navegador (solo lectura)"
                    : "Connect private history to the browser agent (read-only)"}
                </label>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
                  {locale === "es"
                    ? "WebMCP nativo no detectado en este navegador. El historial web funciona de forma totalmente segura e independiente vía REST."
                    : "Native WebMCP is unavailable in this browser. Web history works independently."}
                </p>
              )}
              {agentAccess && (
                <p role="status" style={{ color: "var(--mint)", fontSize: "0.85rem", marginTop: "8px" }}>
                  ✓ {locale === "es" ? "Agente conectado: puede leer este historial privado hasta bloquear la vista." : "Agent connected: it can read this private history until you lock the view."}
                </p>
              )}
            </div>
          </details>
        </section>

        {/* Info Box */}
        <details
          className="history-evidence-note"
          style={{
            background: "var(--white)",
            border: "1px solid var(--line)",
            borderRadius: "12px",
            padding: "12px 18px",
            marginBottom: "1.5rem",
          }}
        >
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.88rem", fontWeight: 600 }}>
            ℹ️ Cómo interpretar este registro y la privacidad de tus entregas
          </summary>
          <p style={{ color: "var(--ink)", fontSize: "0.85rem", margin: "8px 0 0 0", lineHeight: 1.6 }}>
            {c.note}
          </p>
        </details>

        {/* State / Status Indicator */}
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: "1.5rem",
            padding: "12px 18px",
            borderRadius: "10px",
            background: state === "ready" ? "var(--white)" : state === "loading" ? "var(--white)" : "var(--white)",
            border: state === "ready" ? "1px solid var(--line)" : state === "loading" ? "1px solid var(--line)" : "1px solid var(--line)",
            color: state === "ready" ? "var(--mint)" : state === "loading" ? "var(--blue)" : "var(--muted)",
            fontSize: "0.9rem",
            fontWeight: 600,
          }}
        >
          {state !== "ready" ? c[state] : entries.length === 0 ? c.empty : `✓ ${c.latest}`}
        </div>

        {state === "ready" && <ActivityDashboard token={token.trim()} onUnauthorized={lock} />}

        {state === "ready" && entries.length > 0 && (
          <details style={{ marginTop: "2rem" }}>
            <summary style={{ cursor: "pointer", color: "var(--violet)", fontWeight: 700, fontSize: "1rem", padding: "10px 0" }}>
              🔍 Últimas operaciones · vista técnica detallada
            </summary>
            <section aria-label={c.heading} className="history-records" style={{ marginTop: "1rem" }}>
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="history-record"
                  style={{
                    background: "var(--white)",
                    border: "1px solid var(--line)",
                    borderRadius: "14px",
                    padding: "1.5rem",
                    marginBottom: "1.2rem",
                  }}
                >
                  <div className="history-record-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <h2 style={{ fontSize: "1.15rem", margin: 0, color: "var(--ink)" }}>{entry.service.title}</h2>
                    <span className="history-badge" style={{ background: "var(--white)", color: "var(--violet)", border: "1px solid var(--line)", borderRadius: "20px", padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700 }}>
                      {c.modes[entry.mode]}
                    </span>
                  </div>
                  <p className="history-evidence-note" style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "6px 0 16px 0" }}>
                    {c.evidence}
                  </p>
                  <dl style={{ display: "grid", gap: "8px", margin: "16px 0" }}>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <dt style={{ color: "var(--muted)", minWidth: "120px", fontSize: "0.85rem" }}>{c.provider}:</dt>
                      <dd style={{ margin: 0, color: "var(--ink)", fontSize: "0.85rem" }}>{entry.service.provider}</dd>
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <dt style={{ color: "var(--muted)", minWidth: "120px", fontSize: "0.85rem" }}>{c.agent}:</dt>
                      <dd style={{ margin: 0, color: "var(--ink)", fontSize: "0.85rem" }}>{entry.agentId || c.unidentified}</dd>
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <dt style={{ color: "var(--muted)", minWidth: "120px", fontSize: "0.85rem" }}>{c.recorded}:</dt>
                      <dd style={{ margin: 0, color: "var(--ink)", fontSize: "0.85rem" }}>
                        <time dateTime={entry.recordedAt}>{entry.recordedAt}</time>
                      </dd>
                    </div>
                  </dl>
                  <div className="history-outcomes" style={{ borderTop: "1px solid var(--line)", paddingTop: "14px", marginTop: "14px" }}>
                    <section>
                      <h3 style={{ fontSize: "0.95rem", color: "var(--ink)", margin: "0 0 6px 0" }}>{c.payment}</h3>
                      <strong style={{ color: "var(--mint)", fontSize: "0.85rem" }}>{c.statuses[entry.payment.status]}</strong>
                      <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "var(--ink)" }}>
                        <HistoryAmount atomic={entry.payment.amountAtomic} asset={entry.payment.asset} /> · {entry.payment.network}
                      </div>
                      {entry.mode === "testnet" && entry.payment.network === "stellar:testnet" && /^[a-fA-F0-9]{64}$/.test(entry.payment.transactionHash || "") && (
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${entry.payment.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--violet)", fontSize: "0.82rem", display: "inline-block", marginTop: "6px" }}
                        >
                          {c.transaction} ↗
                        </a>
                      )}
                    </section>
                    <section>
                      <h3 style={{ fontSize: "0.95rem", color: "var(--ink)", margin: "0 0 6px 0" }}>{c.delivery}</h3>
                      <strong style={{ color: "var(--blue)", fontSize: "0.85rem" }}>{c.statuses[entry.delivery.status]}</strong>
                      {entry.delivery.result !== undefined ? <HistoryResult value={entry.delivery.result} label={c.result} /> : <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{c.absent}</p>}
                    </section>
                  </div>
                </article>
              ))}
            </section>
          </details>
        )}
      </main>

      <Footer />
    </div>
  );
}
