import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const INGEST_URL = `${BASE_URL}/api/publisher/ingest`;
const RESOURCES_URL = `${BASE_URL}/api/discovery/resources`;
const SEARCH_URL = `${BASE_URL}/api/discovery/search`;

console.log(`\n===============================================================`);
console.log(`🧪 [INGESTION QA & CONFORMANCE] Ingest & Discovery Suite`);
console.log(`🎯 Target Base URL: ${BASE_URL}`);
console.log(`===============================================================\n`);

const timestamp = Date.now();
const validCardId = `oracle-price-feed-${timestamp}`;
const validDestination = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function createCard(overrides = {}) {
  return {
    version: "bazaar.service-card/v0",
    id: overrides.id ?? validCardId,
    name: overrides.name ?? "Stellar Oracle Price Feed",
    description:
      overrides.description ??
      "High precision deterministic price feed for Stellar assets with SLA guarantees.",
    kind: overrides.kind ?? "http",
    url: overrides.url ?? "https://oracle.provider.example.com",
    routeTemplate: overrides.routeTemplate ?? "/v1/oracle/{symbol}",
    input: overrides.input ?? [{ name: "symbol", type: "string", required: true }],
    network: overrides.network ?? "stellar:testnet",
    payment: {
      scheme: "exact",
      asset: "USDC",
      amount: "0.05",
      destination: validDestination,
      ...(overrides.payment ?? {}),
    },
    provider: overrides.provider ?? { name: "QA Oracle Provider Corp" },
    tags: overrides.tags ?? ["oracle", "price-feed", "defi", "market-data"],
  };
}

async function postIngest(card) {
  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// CASO 1: Ingesta exitosa (HTTP 201)
console.log("▶ [1/5] TC-01: Verificando ingesta exitosa de ServiceCard canónica...");
const validCard = createCard();
const ingestRes = await postIngest(validCard);

assert.equal(
  ingestRes.status,
  201,
  `La ingesta de una tarjeta válida debe responder HTTP 201 Created. Obtenido: ${ingestRes.status}`,
);
assert.equal(ingestRes.data.ok, true, "Respuesta debe tener ok: true");
assert.ok(ingestRes.data.card || ingestRes.data.resource, "Respuesta debe incluir la tarjeta registrada");
console.log(`  ✓ Ingesta exitosa confirmada para ID: '${validCard.id}' (HTTP 201)`);

// CASO 2: Rechazo de montos inválidos / precisión incorrecta
console.log("\n▶ [2/5] TC-02: Verificando rechazo de montos inválidos / precisión incorrecta...");

// 2a. Monto negativo
const negativeCard = createCard({
  id: `negative-amt-${timestamp}`,
  payment: { amount: "-0.50" },
});
const negRes = await postIngest(negativeCard);
assert.equal(negRes.status, 400);
assert.equal(negRes.data.ok, false);
console.log("  ✓ Monto negativo (-0.50) rechazado con HTTP 400");

// 2b. Precisión inválida (> 7 decimales)
const highPrecisionCard = createCard({
  id: `high-prec-${timestamp}`,
  payment: { amount: "0.12345678" },
});
const precRes = await postIngest(highPrecisionCard);
assert.equal(precRes.status, 400);
assert.equal(precRes.data.ok, false);
console.log("  ✓ Precisión excesiva (>7 decimales) rechazada con HTTP 400");

// 2c. Monto cero
const zeroCard = createCard({
  id: `zero-amt-${timestamp}`,
  payment: { amount: "0" },
});
const zeroRes = await postIngest(zeroCard);
assert.equal(zeroRes.status, 400);
console.log("  ✓ Monto cero rechazado con HTTP 400");

// CASO 3: Validación de cuentas públicas Stellar
console.log("\n▶ [3/5] TC-03: Verificando validación estricta de cuentas públicas Stellar...");

// 3a. Destinatario malformado
const invalidDestCard = createCard({
  id: `bad-dest-${timestamp}`,
  payment: { destination: "INVALID_STELLAR_ACCOUNT_000000000" },
});
const destRes = await postIngest(invalidDestCard);
assert.equal(destRes.status, 400);
assert.equal(destRes.data.ok, false);
console.log("  ✓ Destinatario malformado rechazado con HTTP 400");

// 3b. Clave secreta (prefijo 'S')
const secretSeedCard = createCard({
  id: `secret-seed-${timestamp}`,
  payment: { destination: "SBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
});
const seedRes = await postIngest(secretSeedCard);
assert.equal(seedRes.status, 400);
console.log("  ✓ Clave secreta (prefijo 'S') prevenida y rechazada con HTTP 400");

// CASO 4: Mitigaciones de SSRF y Route Traversal
console.log("\n▶ [4/5] TC-04: Verificando mitigaciones de SSRF y Route Traversal...");

// 4a. Path traversal '..'
const traversalCard = createCard({
  id: `traversal-${timestamp}`,
  routeTemplate: "/v1/../../etc/passwd/{symbol}",
});
const travRes = await postIngest(traversalCard);
assert.equal(travRes.status, 400);
console.log("  ✓ Path traversal '..' bloqueado con HTTP 400");

// 4b. Caracteres peligrosos (@, #, newline)
const dangerousCharCard = createCard({
  id: `danger-char-${timestamp}`,
  routeTemplate: "/v1/quote#{symbol}@internal-gateway\n",
});
const dangerRes = await postIngest(dangerousCharCard);
assert.equal(dangerRes.status, 400);
console.log("  ✓ Caracteres especiales y fragmentos peligrosos (@, #, \\n) bloqueados con HTTP 400");

// 4c. Ruta relativa sin '/'
const noSlashCard = createCard({
  id: `no-slash-${timestamp}`,
  routeTemplate: "v1/quote/{symbol}",
});
const slashRes = await postIngest(noSlashCard);
assert.equal(slashRes.status, 400);
console.log("  ✓ Ruta sin prefijo '/' rechazada con HTTP 400");

// CASO 5: Verificación en Discovery APIs
console.log("\n▶ [5/5] TC-05: Verificando indexación e integración con Discovery APIs...");

// 5a. Verificación en /api/discovery/resources
const listRes = await fetch(RESOURCES_URL);
assert.equal(listRes.status, 200);
const listData = await listRes.json();
assert.ok(Array.isArray(listData.results));

const foundInResources = listData.results.some((r) => r.id === validCardId);
assert.ok(
  foundInResources,
  `La ServiceCard registrada '${validCardId}' debe ser listada en /api/discovery/resources`,
);
console.log(`  ✓ ServiceCard '${validCardId}' visible en catálogo general /api/discovery/resources`);

// 5b. Verificación en /api/discovery/search
const searchQuery = "Oracle Price Feed";
const searchRes = await fetch(`${SEARCH_URL}?query=${encodeURIComponent(searchQuery)}`);
assert.equal(searchRes.status, 200);
const searchData = await searchRes.json();
assert.equal(searchData.ok, true);
assert.ok(Array.isArray(searchData.results));

const foundInSearch = searchData.results.find((r) => r.resource.id === validCardId);
assert.ok(
  foundInSearch,
  `La ServiceCard registrada '${validCardId}' debe ser encontrada por el motor de búsqueda léxica`,
);
assert.ok(foundInSearch.score > 0);
console.log(`  ✓ Búsqueda de '${searchQuery}' indexó la tarjeta con score: ${foundInSearch.score}`);

console.log("\n===============================================================");
console.log("✅ TODAS LAS PRUEBAS DE INGESTA Y CONFORMANCE DE PROVIDERS PASARON (100% PASS)");
console.log("===============================================================\n");
