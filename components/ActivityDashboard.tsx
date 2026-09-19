"use client";
import { RecoveryStatus } from "./RecoveryStatus";
import { PrivatePurchase } from "./PrivatePurchase";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskSummary, ActivityEvent } from "@/lib/activity";
import type { OperationHistoryRecord } from "@/lib/operation-history";
import { connectPrivateHistory } from "@/lib/webmcp/private-history";
type Purchase = Omit<OperationHistoryRecord, "delivery"> & {
  delivery: Omit<OperationHistoryRecord["delivery"], "artifact"> & {
    artifact?:
      | { kind: "file"; filename: string; mediaType: string }
      | { kind: "external"; url: string; label: string };
  };
};
type Page<T> = { items: T[]; nextCursor: string | null };
const outcomeNames: Record<string, string> = {
  "not-requested": "No solicitado",
  "reported-unverified": "Reportado · sin verificación independiente",
  failed: "Fallo reportado",
  unknown: "Desconocido · requiere conciliación",
  pending: "Pendiente",
  "reported-delivered": "Resultado recibido según el agente",
};
const statusNames = {
  active: "En curso · último estado recibido",
  completed: "Terminada",
  error: "Interrupción reportada",
  legacy: "Compra sin pasos históricos",
};
const stepNames: Record<string, string> = {
  "task-started": "Inicio",
  search: "Búsqueda",
  "service-inspected": "Consulta de servicio",
  "service-selected": "Selección",
  "request-started": "Solicitud",
  "payment-reported": "Pago reportado",
  "delivery-reported": "Entrega reportada",
  "task-completed": "Finalización",
  error: "Interrupción",
};
export function ReadableResult({ value }: { value: unknown }) {
  if (typeof value === "string") return <p className="result-text">{value}</p>;
  if (Array.isArray(value))
    return (
      <ol>
        {value.map((v, i) => (
          <li key={i}>
            <ReadableResult value={v} />
          </li>
        ))}
      </ol>
    );
  if (value && typeof value === "object")
    return (
      <dl>
        {Object.entries(value).map(([key, v]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <ReadableResult value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{String(value ?? "—")}</span>;
}
export function PurchaseResult({
  record,
  onDownload,
}: {
  record: Purchase;
  onDownload: () => void;
}) {
  const { result, artifact } = record.delivery;
  let external: string | undefined;
  try {
    if (artifact?.kind === "external") {
      const url = new URL(artifact.url);
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.origin === new URL(record.service.url).origin
      )
        external = url.href;
    }
  } catch {
    /* Invalid provider reference remains inert. */
  }
  return (
    <section>
      {result !== undefined && (
        <details>
          <summary>Ver resultado</summary>
          <ReadableResult value={result} />
          <details>
            <summary>Contenido original</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </details>
      )}
      {(result !== undefined || artifact?.kind === "file") && (
        <button onClick={onDownload}>
          Descargar
          {artifact?.kind === "file" ? " · " + artifact.filename : " resultado"}
        </button>
      )}
      {external && (
        <p>
          <a href={external} target="_blank" rel="noopener noreferrer">
            {artifact?.kind === "external" ? artifact.label : "Abrir entrega"}{" "}
            ↗
          </a>
          <small> El proveedor puede solicitar su propio acceso.</small>
        </p>
      )}
      {result === undefined && !artifact && (
        <p>
          Resultado no conservado. Su recuperación depende del proveedor; el
          pago no permite reconstruirlo.
        </p>
      )}
    </section>
  );
}
export function ActivityDashboard({
  token,
  review = false,
  onUnauthorized,
}: {
  token: string;
  review?: boolean;
  onUnauthorized?: () => void;
}) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]),
    [events, setEvents] = useState<ActivityEvent[]>([]),
    [purchases, setPurchases] = useState<Purchase[]>([]), [cardRecords, setCardRecords] = useState<Purchase[]>([]);
  const [task, setTask] = useState(""),
    [agent, setAgent] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [cursor, setCursor] = useState<string | null>(null),
    [eventCursor, setEventCursor] = useState<string | null>(null),
    [purchaseCursor, setPurchaseCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState(""),
    [updated, setUpdated] = useState(""),
    [busy, setBusy] = useState(false);
  const pageCounts = useRef({ tasks: 1, events: 1, operations: 1 });
  const generation = useRef(0),
    inFlight = useRef(false),
    controllers = useRef(new Set<AbortController>());
  const fetchPage = useCallback(
    async <T,>(
      view: string,
      extra: Record<string, string> = {},
    ): Promise<Page<T>> => {
      const q = new URLSearchParams({ view, limit: "20", ...extra });
      if (agent) q.set("agentId", agent);
      if (status) q.set("status", status);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        const res = await fetch("/api/activity?" + q, {
          headers: { Authorization: "Bearer " + token },
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        if (!res.ok)
          throw Error(
            res.status === 401 || res.status === 403
              ? "Acceso no válido"
              : res.status === 503
                ? "Historial no disponible"
                : "No se pudo consultar el historial",
          );
        const data = await res.json();
        if (data.version !== "2" || !Array.isArray(data.items))
          throw Error("Respuesta no válida");
        return data;
      } finally {
        controllers.current.delete(controller);
      }
    },
    [token, agent, status, from, to],
  );
  const refresh = useCallback(async () => {
    if (inFlight.current || review) return;
    inFlight.current = true;
    const current = generation.current;
    setBusy(true);
    try {
      async function loaded<T>(
        view: "tasks" | "events" | "operations",
        extra: Record<string, string> = {},
      ) {
        let page = await fetchPage<T>(view, extra);
        let items = page.items;
        for (let i = 1; i < pageCounts.current[view] && page.nextCursor; i++) {
          page = await fetchPage<T>(view, {
            ...extra,
            cursor: page.nextCursor,
          });
          items = [...items, ...page.items];
        }
        return { ...page, items };
      }
      const page = await loaded<TaskSummary>("tasks");
      const cardPage = await loaded<Purchase>("operations");
      let details: [Page<ActivityEvent>, Page<Purchase>] | undefined;
      if (task)
        details = await Promise.all([
          loaded<ActivityEvent>("events", { taskId: task }),
          loaded<Purchase>("operations", { taskId: task }),
        ]);
      if (current !== generation.current) return;
      setTasks(page.items);
      setCardRecords(cardPage.items);
      setCursor(page.nextCursor);
      if (details) {
        setEvents(details[0].items);
        setEventCursor(details[0].nextCursor);
        setPurchases(details[1].items);
        setPurchaseCursor(details[1].nextCursor);
      }
      setUpdated(new Date().toISOString());
      setNotice("");
    } catch (e) {
      if (current === generation.current) {
        if (e instanceof Error && e.message === "Acceso no válido") {
          setTasks([]);
          setEvents([]);
          setPurchases([]);
          onUnauthorized?.();
        }
        setNotice(e instanceof Error ? e.message : "Historial no disponible");
      }
    } finally {
      if (current === generation.current) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }, [fetchPage, task, review, onUnauthorized]);
  useEffect(() => {
    generation.current++;
    pageCounts.current = { tasks: 1, events: 1, operations: 1 };
    inFlight.current = false;
    setTasks([]);
    setEvents([]);
    setPurchases([]);
    setUpdated("");
    setCursor(null);
    setEventCursor(null);
    setPurchaseCursor(null);
    if (review) {
      setTasks(reviewTasks);
      setTask("review-task");
      setEvents(reviewEvents);
      setPurchases(reviewPurchases);
      return;
    }
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => {
      generation.current++;
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
      clearInterval(interval);
    };
    // Pagination cursors intentionally do not restart the lifecycle. Refresh replaces the current page set.
  }, [refresh, review]);
  async function more(
    view: "tasks" | "events" | "operations",
    next: string | null,
  ) {
    if (!next || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const current = generation.current;
    try {
      const page = await fetchPage<never>(view, {
        cursor: next,
        ...(view !== "tasks" ? { taskId: task } : {}),
      });
      if (current !== generation.current) return;
      pageCounts.current[view]++;
      if (view === "tasks") {
        setTasks((t) => [...t, ...page.items]);
        setCursor(page.nextCursor);
      } else if (view === "events") {
        setEvents((e) => [...e, ...page.items]);
        setEventCursor(page.nextCursor);
      } else {
        setPurchases((p) => [...p, ...page.items]);
        setPurchaseCursor(page.nextCursor);
      }
    } catch {
      if (current === generation.current)
        setNotice("No se pudo cargar la siguiente página");
    } finally {
      if (current === generation.current) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }
  async function download(record: Purchase) {
    const current = generation.current;
    try {
      let blob: Blob;
      if (review)
        blob = new Blob([JSON.stringify(record.delivery.result, null, 2)], {
          type: "application/json",
        });
      else {
        const controller = new AbortController();
        controllers.current.add(controller);
        try {
          const res = await fetch(
            "/api/activity?download=1&operationId=" +
              encodeURIComponent(record.id),
            {
              headers: { Authorization: "Bearer " + token },
              credentials: "omit",
              cache: "no-store",
              redirect: "error",
              signal: controller.signal,
            },
          );
          if (!res.ok) throw Error();
          blob = await res.blob();
        } finally {
          controllers.current.delete(controller);
        }
      }
      if (current !== generation.current) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        record.delivery.artifact?.kind === "file"
          ? record.delivery.artifact.filename
          : "result.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (current === generation.current)
        setNotice("No se pudo descargar el resultado");
    }
  }
  return (
    <section className="activity-dashboard" aria-label="Actividad y compras">
      <h2>Tu biblioteca privada</h2>
      {review && (
        <p className="history-badge">
          Vista de revisión · datos simulados · ningún pago
        </p>
      )}
      <p>
        Última actualización:{" "}
        {updated
          ? new Date(updated).toLocaleString()
          : review
            ? "Ejemplo de revisión"
            : "Esperando datos"}
        . Sin nuevos eventos no se puede determinar si el agente sigue
        trabajando.
      </p>
      {!review && (
        <>
          <div className="history-filters">
            <label>
              Agente
              <input
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="Identificador del agente"
              />
            </label>
            <label>
              Estado
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos</option>
                {Object.entries(statusNames).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde (UTC)
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Hasta (UTC)
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <button onClick={() => void refresh()} disabled={busy}>
            Actualizar actividad
          </button>
        </>
      )}
      <p role="status" aria-live="polite">
        {notice ||
          (!tasks.length && !busy
            ? "Todavía no hay tareas ni compras registradas."
            : "")}
      </p>
      <div className="task-grid">
        {tasks.map((t) => {
          const record = cardRecords.find(r => r.taskId === t.id);
          const raw = record?.delivery.result;
          const original = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
          let title = t.title;
          if (original.provider === "website-intelligence" && typeof original.requestedUrl === "string") { try { title = "Análisis de " + new URL(original.requestedUrl).hostname; } catch {} }
          return (
          <button
            key={t.id}
            aria-pressed={task === t.id}
            onClick={() => setTask(t.id)}
          >
            <strong>{title}</strong>
            <span>
              {original.mode === "live" ? "Informe · contenido real" : original.mode === "fixture" || t.mode === "fixture" ? "Datos de prueba" : "Entrega del agente"} · {new Date(t.updatedAt).toLocaleDateString()}
            </span>
            <span>{statusNames[t.status]}</span>
            <small>
              {t.steps} pasos · {t.purchases} {t.purchases === 1 ? "operación" : "operaciones"}
              {record?.payment.status === "not-requested" ? " · Sin pago" : ""}
            </small>
          </button>
        ); })}
      </div>
      {cursor && (
        <button disabled={busy} onClick={() => void more("tasks", cursor)}>
          Más tareas
        </button>
      )}
      {task && (
        <>
          {!purchases.length && <RecoveryStatus events={events} />}
          {!purchases.length && <details open><summary>Actividad de la tarea · sin entrega disponible</summary>          <h3>Pasos de la tarea</h3>
          {!events.length && <p>No hay pasos históricos para esta compra.</p>}
          <ol className="activity-timeline">
            {events.map((e) => (
              <li key={e.eventId}>
                <strong>
                  {stepNames[e.kind]} · {e.title}
                </strong>
                <small>
                  {new Date(e.recordedAt).toLocaleString()} · Reportado por
                  agente · {e.mode}
                </small>
                {e.result !== undefined && (
                  <details>
                    <summary>Ver respuesta</summary>
                    <ReadableResult value={e.result} />
                  </details>
                )}
              </li>
            ))}
          </ol>
          {eventCursor && (
            <button
              disabled={busy}
              onClick={() => void more("events", eventCursor)}
            >
              Más pasos
            </button>
          )}
</details>}
          {purchases.length > 0 && eventCursor && <button disabled={busy} onClick={() => void more("events", eventCursor)}>Cargar más actividad del agente</button>}
          <h3>Resultados</h3>
          {!purchases.length && <p>Todavía no hay una entrega registrada para esta tarea.</p>}
          {purchases.map((r) => <PrivatePurchase key={r.id} token={token} record={r} events={events.filter(e=>!e.operationId||e.operationId===r.clientOperationId)} onUnauthorized={onUnauthorized} legacyDownload={<PurchaseResult record={r} onDownload={()=>void download(r)}/>}/>)}
          {purchaseCursor && (
            <button
              disabled={busy}
              onClick={() => void more("operations", purchaseCursor)}
            >
              Más compras
            </button>
          )}
        </>
      )}
      {!review && <details><summary>Configuración del agente y detalles técnicos</summary>{tasks.find(t => t.id === task)?.agentId && <p>Identificador del agente: {tasks.find(t => t.id === task)?.agentId}</p>}<PrivateConnection readToken={token} /></details>}
    </section>
  );
}
function formatAmount(atomic: string, asset: string) {
  if (asset !== "USDC") return atomic + " unidades atómicas · " + asset;
  const a = BigInt(atomic);
  return (
    String(a / 10000000n) +
    (a % 10000000n
      ? "." +
        String(a % 10000000n)
          .padStart(7, "0")
          .replace(/0+$/, "")
      : "") +
    " USDC"
  );
}
function PrivateConnection({ readToken }: { readToken: string }) {
  const [writeToken, setWriteToken] = useState(""),
    [agentId, setAgentId] = useState(""),
    [taskId, setTaskId] = useState(""),
    [title, setTitle] = useState(""),
    [message, setMessage] = useState(""),
    [connected, setConnected] = useState(false);
  const disconnect = useRef<(() => void) | null>(null),
    connectionGeneration = useRef(0),
    connecting = useRef(false);
  useEffect(
    () => () => {
      connectionGeneration.current++;
      disconnect.current?.();
    },
    [],
  );
  function stop() {
    connectionGeneration.current++;
    connecting.current = false;
    disconnect.current?.();
    disconnect.current = null;
    setWriteToken("");
    setConnected(false);
    setMessage("Conexión cerrada");
  }
  async function start() {
    if (connecting.current || connected) return;
    const current = connectionGeneration.current;
    const native = navigator.modelContext;
    if (!native || native === window.modelContext || !native.unregisterTool) {
      setMessage(
        "Se requiere WebMCP nativo. Para un cliente externo, consulta la guía de conexión.",
      );
      return;
    }
    if (
      !/^[A-Za-z0-9_-]{43,128}$/.test(writeToken) ||
      ![agentId, taskId].every((v) =>
        /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v),
      ) ||
      !title.trim() ||
      title.length > 160
    ) {
      setMessage("Revisa el acceso y los identificadores de agente y tarea.");
      return;
    }
    try {
      connecting.current = true;
      const response = await fetch("/api/activity/connection", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + readToken,
          "X-History-Write-Access": "Bearer " + writeToken,
        },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
      if (current !== connectionGeneration.current) return;
      if (!response.ok) {
        setMessage(
          "Los accesos de lectura y escritura deben pertenecer al mismo propietario.",
        );
        return;
      }
      disconnect.current = connectPrivateHistory(native, {
        writeToken,
        agentId,
        taskId,
        taskTitle: title,
        baseUrl: location.origin,
        onFailure: () =>
          setMessage(
            "No se pudo guardar un paso. No repitas un pago por este motivo.",
          ),
      });
      setConnected(true);
      setWriteToken("");
      setMessage(
        "Conectado. El agente debe usar las herramientas bazaar_private_ de esta página.",
      );
    } catch {
      if (current === connectionGeneration.current)
        setMessage("No se pudo conectar WebMCP nativo");
    } finally {
      connecting.current = false;
    }
  }
  return (
    <section className="history-access">
      <h3>Conectar actividad del navegador</h3>
      <p>
        La conexión usa el acceso de escritura asignado al mismo propietario del
        historial. Permanece en memoria hasta desconectar o salir. Las compras
        externas requieren el cliente integrado.
      </p>
      <a
        href="/HISTORY_CONNECTION.md"
        target="_blank"
        rel="noopener noreferrer"
      >
        Instrucciones para WebMCP y cliente externo
      </a>
      <fieldset disabled={connected}>
        <label>
          Acceso de escritura
          <input
            type="password"
            autoComplete="off"
            value={writeToken}
            onChange={(e) => setWriteToken(e.target.value)}
          />
        </label>
        <label>
          Agente
          <input value={agentId} onChange={(e) => setAgentId(e.target.value)} />
        </label>
        <label>
          Referencia de tarea
          <input value={taskId} onChange={(e) => setTaskId(e.target.value)} />
        </label>
        <label>
          Nombre de la tarea
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button onClick={start}>Conectar actividad</button>
      </fieldset>
      <button onClick={stop}>Desconectar</button>
      <p role="status">{message}</p>
    </section>
  );
}
const reviewTasks: TaskSummary[] = [
  {
    id: "review-task",
    title: "Preparar un informe de sitio web",
    agentId: "agente-demo",
    mode: "mock",
    updatedAt: "2026-09-08T12:01:00.000Z",
    status: "completed",
    steps: 4,
    purchases: 1,
  },
];
const reviewEvents: ActivityEvent[] = [
  "task-started",
  "search",
  "delivery-reported",
  "task-completed",
].map((kind, i) => ({
  eventId: "demo-" + i,
  taskId: "review-task",
  agentId: "agente-demo",
  mode: "mock",
  kind: kind as ActivityEvent["kind"],
  title: [
    "Preparar un informe",
    "Servicios consultados",
    "Informe disponible",
    "Tarea terminada",
  ][i],
  recordedAt: "2026-09-08T12:0" + i + ":00.000Z",
  evidence: "agent-reported",
}));
const reviewPurchases: Purchase[] = [
  {
    id: "review-purchase",
    clientOperationId: "demo-operation",
    taskId: "review-task",
    agentId: "agente-demo",
    mode: "mock",
    recordedAt: "2026-09-08T12:02:00.000Z",
    evidence: "agent-reported",
    service: {
      id: "website-demo",
      title: "Informe de sitio web · ejemplo",
      provider: "Proveedor simulado",
      url: "https://example.com",
    },
    payment: {
      status: "not-requested",
      network: "stellar:testnet",
      asset: "USDC",
      amountAtomic: "0",
      recipient: "G" + "A".repeat(55),
    },
    delivery: {
      status: "reported-delivered",
      result: {
        resumen:
          "Ejemplo de informe comprado por el agente. No se realizó una compra real.",
        hallazgos: ["Presentación del producto", "Información de contacto"],
        recomendacion: "Revisar los hallazgos antes de usarlos.",
      },
    },
  },
];
