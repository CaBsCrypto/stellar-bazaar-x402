import assert from "node:assert/strict";

const base = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const url = `${base}/api/mcp`;
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

const K = 3;

const golden = [
  { query: "swap", relevant: ["swap-risk-quote"] },
  { query: "riesgo", relevant: ["swap-risk-quote", "contract-safety-mcp"] },
  { query: "contrato", relevant: ["contract-safety-mcp"] },
  { query: "mercado", relevant: ["market-window-mcp"] },
  { query: "ledger", relevant: ["stellar-ledger-brief"] },
  { query: "analytics", relevant: ["stellar-ledger-brief"] },
  { query: "defi", relevant: ["swap-risk-quote"] },
  { query: "mcp", relevant: ["contract-safety-mcp", "market-window-mcp"] },
];

async function rpc(id, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

const dcgb = (ranks) => ranks.reduce((sum, rel, i) => sum + (rel ? 1 / Math.log2(i + 2) : 0), 0);
const idcg = (nRelevant) => {
  const ranks = Array.from({ length: nRelevant }, (_, i) => i < K);
  return dcgb(ranks);
};

const call = await rpc(1, "tools/call", { name: "search_services", arguments: { query: "swap", limit: 50 } });
const determinismA = JSON.parse(call.result.content[0].text);
const callB = await rpc(2, "tools/call", { name: "search_services", arguments: { query: "swap", limit: 50 } });
const determinismB = JSON.parse(callB.result.content[0].text);
assert.deepEqual(
  determinismA.results.map((r) => [r.resource.id, r.score]),
  determinismB.results.map((r) => [r.resource.id, r.score]),
  "benchmark preflight: ranking must be deterministic",
);

const rows = [];
for (const [i, item] of golden.entries()) {
  const rpcCall = await rpc(3 + i, "tools/call", { name: "search_services", arguments: { query: item.query, limit: 50 } });
  const payload = JSON.parse(rpcCall.result.content[0].text);
  const rankedIds = payload.results.map((r) => r.resource.id);
  const hits = rankedIds.slice(0, K).map((id) => item.relevant.includes(id));
  const ndcg = dcgb(hits) / idcg(item.relevant.length);
  const firstRelevant = rankedIds.findIndex((id) => item.relevant.includes(id));
  const mrr = firstRelevant === -1 ? 0 : 1 / (firstRelevant + 1);
  const recall = item.relevant.filter((id) => rankedIds.slice(0, K).includes(id)).length / item.relevant.length;
  rows.push({ query: item.query, relevant: item.relevant, top3: rankedIds.slice(0, K), ndcg, mrr, recall });
}

const meanNdcg = rows.reduce((s, r) => s + r.ndcg, 0) / rows.length;
const meanMrr = rows.reduce((s, r) => s + r.mrr, 0) / rows.length;
const meanRecall = rows.reduce((s, r) => s + r.recall, 0) / rows.length;

assert.ok(meanNdcg >= 0.8, `mean NDCG@${K} gate failed: ${meanNdcg.toFixed(3)}`);
assert.ok(meanMrr >= 0.9, `mean MRR gate failed: ${meanMrr.toFixed(3)}`);
assert.ok(meanRecall >= 0.9, `mean Recall@${K} gate failed: ${meanRecall.toFixed(3)}`);

const listCall = await rpc(12, "tools/call", { name: "list_services", arguments: {} });
const corpus = JSON.parse(listCall.result.content[0].text).services.map((s) => s.id);

console.log(
  JSON.stringify(
    {
      ok: true,
      ranking: "lexical-v1",
      method: "deterministic lexical (no AI)",
      metrics: { k: K, meanNdcg, meanMrr, meanRecall },
      gates: { meanNdcgAtK: ">= 0.80", meanMrr: ">= 0.90", meanRecallAtK: ">= 0.90" },
      rows,
      corpusSnapshot: { serviceIds: corpus, count: corpus.length, capturedAt: new Date().toISOString() },
      notes: ["Reproducible only against a fixed corpus; dynamic provider cards shift results."],
    },
    null,
    2,
  ),
);