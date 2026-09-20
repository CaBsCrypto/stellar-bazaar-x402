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
        <header style={{ marginTop: "1rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <span className="kicker" style={{ margin: 0 }}>
              🔒 {c.heading.toUpperCase()} · CLOUDFLARE R2 & STELLAR TESTNET
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "0.82rem", color: "#94a3b8" }}>Idioma:</label>
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f8fafc",
                  border: "1px solid rgba(255,255,255,0.15)",
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
          <p style={{ color: "#94a3b8", fontSize: "1.05rem", maxWidth: "750px", margin: 0 }}>
            {c.subtitle}
          </p>
        </header>

        {/* Security / Token Card */}
        <section
          className="history-access"
          style={{
            background: "linear-gradient(135deg, rgba(20, 24, 38, 0.85) 0%, rgba(13, 16, 26, 0.95) 100%)",
            border: "1px solid rgba(112, 87, 232, 0.3)",
            borderRadius: "16px",
            padding: "clamp(1.2rem, 3vw, 2rem)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
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
              <label htmlFor="history-access-token" style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>
                🔑 {c.token}
              </label>
              <button
                type="button"
                onClick={pasteToken}
                style={{
                  background: "rgba(112, 87, 232, 0.15)",
                  border: "1px solid rgba(112, 87, 232, 0.4)",
                  color: "#c4b5fd",
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
                  background: "rgba(8, 10, 16, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  fontFamily: "monospace",
                }}
              />
            </div>

            <p style={{ fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.5, margin: "0 0 16px 0" }}>
              💡 {c.access}
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="submit"
                disabled={!token.trim() || state === "loading"}
                style={{
                  padding: "10px 22px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #7057e8 0%, #583ec9 100%)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(112, 87, 232, 0.4)",
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
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#fca5a5",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
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

          <details style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <summary style={{ cursor: "pointer", color: "#c4b5fd", fontSize: "0.85rem", fontWeight: 600 }}>
              ⚙️ Conexión nativa del navegador (WebMCP)
            </summary>
            <div style={{ marginTop: "10px" }}>
              {nativeAvailable ? (
                <label className="history-agent-access" style={{ display: "flex", gap: "10px", alignItems: "center", color: "#e2e8f0", fontSize: "0.88rem" }}>
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
                <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>
                  {locale === "es"
                    ? "WebMCP nativo no detectado en este navegador. El historial web funciona de forma totalmente segura e independiente vía REST."
                    : "Native WebMCP is unavailable in this browser. Web history works independently."}
                </p>
              )}
              {agentAccess && (
                <p role="status" style={{ color: "#36b990", fontSize: "0.85rem", marginTop: "8px" }}>
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
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            padding: "12px 18px",
            marginBottom: "1.5rem",
          }}
        >
          <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: "0.88rem", fontWeight: 600 }}>
            ℹ️ Cómo interpretar este registro y la privacidad de tus entregas
          </summary>
          <p style={{ color: "#cbd5e1", fontSize: "0.85rem", margin: "8px 0 0 0", lineHeight: 1.6 }}>
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
            background: state === "ready" ? "rgba(16, 185, 129, 0.1)" : state === "loading" ? "rgba(56, 189, 248, 0.1)" : "rgba(255,255,255,0.03)",
            border: state === "ready" ? "1px solid rgba(16, 185, 129, 0.3)" : state === "loading" ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid rgba(255,255,255,0.06)",
            color: state === "ready" ? "#6ee7b7" : state === "loading" ? "#38bdf8" : "#94a3b8",
            fontSize: "0.9rem",
            fontWeight: 600,
          }}
        >
          {state !== "ready" ? c[state] : entries.length === 0 ? c.empty : `✓ ${c.latest}`}
        </div>

        {state === "ready" && <ActivityDashboard token={token.trim()} onUnauthorized={lock} />}

        {state === "ready" && entries.length > 0 && (
          <details style={{ marginTop: "2rem" }}>
            <summary style={{ cursor: "pointer", color: "#c4b5fd", fontWeight: 700, fontSize: "1rem", padding: "10px 0" }}>
              🔍 Últimas operaciones · vista técnica detallada
            </summary>
            <section aria-label={c.heading} className="history-records" style={{ marginTop: "1rem" }}>
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="history-record"
                  style={{
                    background: "rgba(16, 19, 30, 0.9)",
                    border: "1px solid rgba(112, 87, 232, 0.25)",
                    borderRadius: "14px",
                    padding: "1.5rem",
                    marginBottom: "1.2rem",
                  }}
                >
                  <div className="history-record-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <h2 style={{ fontSize: "1.15rem", margin: 0, color: "#f8fafc" }}>{entry.service.title}</h2>
                    <span className="history-badge" style={{ background: "rgba(112, 87, 232, 0.2)", color: "#c4b5fd", border: "1px solid rgba(112, 87, 232, 0.4)", borderRadius: "20px", padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700 }}>
                      {c.modes[entry.mode]}
                    </span>
                  </div>
                  <p className="history-evidence-note" style={{ color: "#94a3b8", fontSize: "0.82rem", margin: "6px 0 16px 0" }}>
                    {c.evidence}
                  </p>
                  <dl style={{ display: "grid", gap: "8px", margin: "16px 0" }}>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <dt style={{ color: "#94a3b8", minWidth: "120px", fontSize: "0.85rem" }}>{c.provider}:</dt>
                      <dd style={{ margin: 0, color: "#e2e8f0", fontSize: "0.85rem" }}>{entry.service.provider}</dd>
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <dt style={{ color: "#94a3b8", minWidth: "120px", fontSize: "0.85rem" }}>{c.agent}:</dt>
                      <dd style={{ margin: 0, color: "#e2e8f0", fontSize: "0.85rem" }}>{entry.agentId || c.unidentified}</dd>
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <dt style={{ color: "#94a3b8", minWidth: "120px", fontSize: "0.85rem" }}>{c.recorded}:</dt>
                      <dd style={{ margin: 0, color: "#e2e8f0", fontSize: "0.85rem" }}>
                        <time dateTime={entry.recordedAt}>{entry.recordedAt}</time>
                      </dd>
                    </div>
                  </dl>
                  <div className="history-outcomes" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "14px", marginTop: "14px" }}>
                    <section>
                      <h3 style={{ fontSize: "0.95rem", color: "#f8fafc", margin: "0 0 6px 0" }}>{c.payment}</h3>
                      <strong style={{ color: "#6ee7b7", fontSize: "0.85rem" }}>{c.statuses[entry.payment.status]}</strong>
                      <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "#cbd5e1" }}>
                        <HistoryAmount atomic={entry.payment.amountAtomic} asset={entry.payment.asset} /> · {entry.payment.network}
                      </div>
                      {entry.mode === "testnet" && entry.payment.network === "stellar:testnet" && /^[a-fA-F0-9]{64}$/.test(entry.payment.transactionHash || "") && (
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${entry.payment.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#c4b5fd", fontSize: "0.82rem", display: "inline-block", marginTop: "6px" }}
                        >
                          {c.transaction} ↗
                        </a>
                      )}
                    </section>
                    <section>
                      <h3 style={{ fontSize: "0.95rem", color: "#f8fafc", margin: "0 0 6px 0" }}>{c.delivery}</h3>
                      <strong style={{ color: "#38bdf8", fontSize: "0.85rem" }}>{c.statuses[entry.delivery.status]}</strong>
                      {entry.delivery.result !== undefined ? <HistoryResult value={entry.delivery.result} label={c.result} /> : <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{c.absent}</p>}
                    </section>
                  </div>
                </article>
              ))}
            </section>
          </details>
        )}
      </main>
    </div>
  );
}
