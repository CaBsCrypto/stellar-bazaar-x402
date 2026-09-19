// Isolated UI test server. Uses mock records and an in-memory Redis model, never real credentials or payments.
import http from "node:http";
import { createHash } from "node:crypto";
import { createHistoryStore } from "../lib/operation-history-store.ts";
import { createActivityStore } from "../lib/activity-store.ts";
import { createHistoryHandlers } from "../lib/operation-history-http.ts";
import { createActivityHandlers } from "../lib/activity-http.ts";
import { authenticateHistory } from "../lib/operation-history-auth.ts";
const port = 3212,
  read = "review-reader-".padEnd(43, "r"),
  write = "review-writer-".padEnd(43, "w"),
  hash = (s) => createHash("sha256").update(s).digest("hex");
const config = JSON.stringify([
  {
    ownerId: "review-only",
    readTokenHash: hash(read),
    writeTokenHash: hash(write),
  },
]);
const maps = new Map(),
  lists = new Map();
const redis = {
  async eval(_s, [key, index], [id, digest, value]) {
    const m = maps.get(key) ?? new Map();
    if (m.has(id))
      return [
        JSON.parse(m.get(id)).digest === digest ? "existing" : "conflict",
        m.get(id),
      ];
    m.set(id, value);
    maps.set(key, m);
    lists.set(index, [id, ...(lists.get(index) ?? [])]);
    return ["created", value];
  },
  async lrange(k, s, e) {
    return (lists.get(k) ?? []).slice(s, e + 1);
  },
  async hmget(k, ...ids) {
    return Object.fromEntries(ids.map((id) => [id, maps.get(k)?.get(id)]));
  },
};
const ops = createHistoryStore(redis),
  events = createActivityStore(redis),
  auth = (h, w) => authenticateHistory(h, w, config),
  operationHandlers = createHistoryHandlers({
    authenticate: auth,
    store: () => ops,
  }),
  activityHandlers = createActivityHandlers({
    authenticate: auth,
    operations: () => ops,
    events: () => events,
  });
await ops.append("review-only", {
  clientOperationId: "sample-purchase",
  taskId: "sample-task",
  agentId: "review-agent",
  mode: "mock",
  service: {
    id: "report",
    title: "Informe de revisión",
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
    result: { resumen: "Resultado privado de prueba. Ninguna compra real." },
  },
});
http
  .createServer(async (req, res) => {
    try {
      const url = "http://127.0.0.1:" + port + req.url;
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
        if (buffers.reduce((n, b) => n + b.length, 0) > 110000) throw Error();
      }
      const body = Buffer.concat(buffers);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method) ? { body } : {}),
      });
      let response;
      if (req.url.split("?")[0] === "/api/activity/connection") {
        try {
          const r = auth(request.headers.get("authorization")),
            w = auth(request.headers.get("x-history-write-access"), true);
          response = Response.json(
            { ok: r.ownerId === w.ownerId },
            { status: r.ownerId === w.ownerId ? 200 : 403 },
          );
        } catch {
          response = Response.json({ ok: false }, { status: 403 });
        }
      } else if (req.url.split("?")[0] === "/api/activity")
        response =
          (await activityHandlers[req.method]?.(request)) ??
          new Response(null, { status: 405 });
      else if (req.url.split("?")[0] === "/api/operations")
        response =
          (await operationHandlers[req.method]?.(request)) ??
          new Response(null, { status: 405 });
      else
        response = await fetch("http://127.0.0.1:3211" + req.url, {
          method: req.method,
          redirect: "manual",
        });
      res.writeHead(
        response.status,
        Object.fromEntries(
          [...response.headers].filter(
            ([k]) =>
              ![
                "content-encoding",
                "content-length",
                "transfer-encoding",
              ].includes(k),
          ),
        ),
      );
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(503);
      res.end("Review unavailable");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(
      "Mock-only review at http://127.0.0.1:3212/history; test access: " +
        read +
        " / " +
        write,
    ),
  );
