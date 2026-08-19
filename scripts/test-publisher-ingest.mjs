import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const INGEST_URL = `${BASE_URL}/api/publisher/ingest`;
const RESOURCES_URL = `${BASE_URL}/api/discovery/resources`;
const SEARCH_URL = `${BASE_URL}/api/discovery/search`;

const providerKey = process.env.BAZAAR_PROVIDER_SECRET;

console.log(`\n===============================================================`);
console.log(`🧪 [INGESTION QA & CONFORMANCE] Ingest & Discovery Suite`);
console.log(`🎯 Target Base URL: ${BASE_URL}`);
console.log(`🔑 Provider key: ${providerKey ? "configured (env)" : "dev-open mode (no secret)"}`);
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

async function request(method, path, card, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(providerKey ? { "X-Bazaar-Provider-Key": providerKey } : {}),
      ...headers,
    },
    body: card ? JSON.stringify(card) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const postIngest = (card) => request("POST", "/api/publisher/ingest", card);

// CASO 1: Ingesta exitosa (HTTP 201)
console.log("▶ [1/9] TC-01: Verificando ingesta exitosa de ServiceCard canónica...");
const validCard = createCard();
const ingestRes = await postIngest(validCard);

assert.equal(
  ingestRes.status,
  201,
  `La ingesta de una tarjeta válida debe responder HTTP 201 Created. Obtenido: ${ingestRes.status}`,
);
assert.equal(ingestRes.data.ok, true, "Respuesta debe tener ok: true");
assert.ok(ingestRes.data.card || ingestRes.data.resource, "Respuesta debe incluir la tarjeta registrada");
assert.equal(ingestRes.data.revision, 1, "Primera ingesta debe tener revision 1");
console.log(`  ✓ Ingesta exitosa confirmada para ID: '${validCard.id}' (HTTP 201, revision 1)`);

// CASO 2: Duplicado → 409 CARD_EXISTS
console.log("\n▶ [2/9] TC-02: Verificando rechazo de duplicados (HTTP 409 CARD_EXISTS)...");
const dupRes = await postIngest(validCard);
assert.equal(dupRes.status, 409, `El mismo id debe responder HTTP 409. Obtenido: ${dupRes.status}`);
assert.equal(dupRes.data.error.code, "CARD_EXISTS");
assert.equal(dupRes.data.error.field, "id");
console.log(`  ✓ Duplicado '${validCard.id}' rechazado con HTTP 409 CARD_EXISTS`);

// CASO 3: Rechazo de montos inválidos / precisión incorrecta
console.log("\n▶ [3/9] TC-03: Verificando rechazo de montos inválidos / precisión incorrecta...");

const negativeCard = createCard({ id: `negative-amt-${timestamp}`, payment: { amount: "-0.50" } });
const negRes = await postIngest(negativeCard);
assert.equal(negRes.status, 400);
assert.equal(negRes.data.ok, false);
console.log("  ✓ Monto negativo (-0.50) rechazado con HTTP 400");

const highPrecisionCard = createCard({ id: `high-prec-${timestamp}`, payment: { amount: "0.12345678" } });
const precRes = await postIngest(highPrecisionCard);
assert.equal(precRes.status, 400);
assert.equal(precRes.data.ok, false);
console.log("  ✓ Precisión excesiva (>7 decimales) rechazada con HTTP 400");

const zeroCard = createCard({ id: `zero-amt-${timestamp}`, payment: { amount: "0" } });
const zeroRes = await postIngest(zeroCard);
assert.equal(zeroRes.status, 400);
console.log("  ✓ Monto cero rechazado con HTTP 400");

// CASO 4: Validación de cuentas públicas Stellar
console.log("\n▶ [4/9] TC-04: Verificando validación estricta de cuentas públicas Stellar...");

const invalidDestCard = createCard({ id: `bad-dest-${timestamp}`, payment: { destination: "INVALID_STELLAR_ACCOUNT_000000000" } });
const destRes = await postIngest(invalidDestCard);
assert.equal(destRes.status, 400);
assert.equal(destRes.data.ok, false);
console.log("  ✓ Destinatario malformado rechazado con HTTP 400");

const secretSeedCard = createCard({ id: `secret-seed-${timestamp}`, payment: { destination: "SBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" } });
const seedRes = await postIngest(secretSeedCard);
assert.equal(seedRes.status, 400);
console.log("  ✓ Clave secreta (prefijo 'S') prevenida y rechazada con HTTP 400");

// CASO 5: Mitigaciones de SSRF y Route Traversal
console.log("\n▶ [5/9] TC-05: Verificando mitigaciones de SSRF y Route Traversal...");

const traversalCard = createCard({ id: `traversal-${timestamp}`, routeTemplate: "/v1/../../etc/passwd/{symbol}" });
const travRes = await postIngest(traversalCard);
assert.equal(travRes.status, 400);
console.log("  ✓ Path traversal '..' bloqueado con HTTP 400");

const dangerousCharCard = createCard({ id: `danger-char-${timestamp}`, routeTemplate: "/v1/quote#{symbol}@internal-gateway\n" });
const dangerRes = await postIngest(dangerousCharCard);
assert.equal(dangerRes.status, 400);
console.log("  ✓ Caracteres especiales y fragmentos peligrosos (@, #, \\n) bloqueados con HTTP 400");

const noSlashCard = createCard({ id: `no-slash-${timestamp}`, routeTemplate: "v1/quote/{symbol}" });
const slashRes = await postIngest(noSlashCard);
assert.equal(slashRes.status, 400);
console.log("  ✓ Ruta sin prefijo '/' rechazada con HTTP 400");

// CASO 6: Validación de forma (schema) — huecos cerrados por zod
console.log("\n▶ [6/9] TC-06: Verificando validación de forma completa (zod schema)...");

const badIdCard = createCard({ id: "Bad ID With Spaces!!", name: "Bad Id" });
const badIdRes = await postIngest(badIdCard);
assert.equal(badIdRes.status, 400);
assert.ok(
  badIdRes.data.error.failedRules.some((r) => r.rule.startsWith("schema.")),
  "id inválido debe fallar con regla schema.*",
);
console.log("  ✓ id con espacios/caracteres inválidos rechazado con schema.* rule");

const missingNameCard = createCard({ name: "" });
const missingNameRes = await postIngest(missingNameCard);
assert.equal(missingNameRes.status, 400);
console.log("  ✓ name vacío rechazado con HTTP 400");

const badInputCard = createCard({ input: [{ name: "", type: "string", required: true }] });
const badInputRes = await postIngest(badInputCard);
assert.equal(badInputRes.status, 400);
console.log("  ✓ input con name vacío rechazado con HTTP 400");

const badTagsCard = createCard({ tags: [42] });
const badTagsRes = await postIngest(badTagsCard);
assert.equal(badTagsRes.status, 400);
console.log("  ✓ tags con tipo inválido rechazado con HTTP 400");

// CASO 7: Actualización vía PUT
console.log("\n▶ [7/9] TC-07: Verificando actualización de ServiceCard (PUT)...");

const updatedCard = createCard({ payment: { amount: "0.06" } });
const putRes = await request("PUT", `/api/publisher/ingest/${validCardId}`, updatedCard);
assert.equal(putRes.status, 200, `PUT debe responder HTTP 200. Obtenido: ${putRes.status}`);
assert.equal(putRes.data.status, "updated-dynamic");
assert.equal(putRes.data.revision, 2, "Segunda operación debe tener revision 2");
assert.equal(putRes.data.card.payment.amount, "0.06");
console.log(`  ✓ ServiceCard '${validCardId}' actualizada (HTTP 200, revision 2, amount 0.06)`);

const missingId = `missing-card-${timestamp}`;
const putMissingRes = await request("PUT", `/api/publisher/ingest/${missingId}`, createCard({ id: missingId }));
assert.equal(putMissingRes.status, 404, "PUT de id inexistente debe responder HTTP 404");
assert.equal(putMissingRes.data.error.code, "RESOURCE_NOT_FOUND");
console.log("  ✓ PUT de id inexistente rechazado con HTTP 404 RESOURCE_NOT_FOUND");

const mismatchRouteId = `route-id-${timestamp}`;
const mismatchCardId = `card-id-${timestamp}`;
const putMismatchRes = await request("PUT", `/api/publisher/ingest/${mismatchRouteId}`, createCard({ id: mismatchCardId }));
assert.equal(putMismatchRes.status, 400, "PUT con id de ruta != id de card debe responder 400");
console.log("  ✓ PUT con id de ruta inconsistente rechazado con HTTP 400");

// CASO 8: Listado de servicios propios (GET) y eliminación (DELETE)
console.log("\n▶ [8/9] TC-08: Verificando listado propio (GET) y eliminación (DELETE)...");

const listRes = await request("GET", "/api/publisher/ingest");
assert.equal(listRes.status, 200);
assert.equal(listRes.data.ok, true);
assert.ok(
  listRes.data.services.some((s) => s.id === validCardId),
  "GET /api/publisher/ingest debe listar los servicios del provider",
);
console.log(`  ✓ GET /api/publisher/ingest listó ${listRes.data.count} servicio(s) del provider`);

const delRes = await request("DELETE", `/api/publisher/ingest/${validCardId}`);
assert.equal(delRes.status, 200, `DELETE debe responder HTTP 200. Obtenido: ${delRes.status}`);
assert.equal(delRes.data.status, "deleted-dynamic");
console.log(`  ✓ ServiceCard '${validCardId}' eliminada (HTTP 200)`);

const delMissingRes = await request("DELETE", `/api/publisher/ingest/${validCardId}`);
assert.equal(delMissingRes.status, 404, "DELETE de id ya eliminado debe responder HTTP 404");
assert.equal(delMissingRes.data.error.code, "RESOURCE_NOT_FOUND");
console.log("  ✓ DELETE de id inexistente rechazado con HTTP 404 RESOURCE_NOT_FOUND");

// CASO 9: Autenticación y persistencia en Discovery
console.log("\n▶ [9/9] TC-09: Verificando autenticación y persistencia en Discovery APIs...");

if (providerKey) {
  const noKeyRes = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createCard({ id: `no-key-${timestamp}` })),
  });
  assert.equal(noKeyRes.status, 401, "Sin provider key debe responder HTTP 401");
  assert.equal(noKeyRes.status === 401 ? (await noKeyRes.json()).error.code : null, "UNAUTHORIZED");
  console.log("  ✓ POST sin provider key rechazado con HTTP 401 UNAUTHORIZED");

  const wrongKeyRes = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bazaar-Provider-Key": "wrong-key" },
    body: JSON.stringify(createCard({ id: `wrong-key-${timestamp}` })),
  });
  assert.equal(wrongKeyRes.status, 401, "Provider key incorrecta debe responder HTTP 401");
  console.log("  ✓ Provider key incorrecta rechazada con HTTP 401 UNAUTHORIZED");
} else {
  console.log("  ⏭ dev-open mode: autenticación no requerida (BAZAAR_PROVIDER_SECRET ausente)");
}

const persistCard = createCard({ id: `persist-${timestamp}` });
const persistRes = await postIngest(persistCard);
assert.equal(persistRes.status, 201);

const listRes2 = await fetch(RESOURCES_URL);
assert.equal(listRes2.status, 200);
const listData2 = await listRes2.json();
assert.ok(Array.isArray(listData2.results));
const foundInResources = listData2.results.some((r) => r.id === persistCard.id);
assert.ok(foundInResources, `La ServiceCard registrada '${persistCard.id}' debe ser listada en /api/discovery/resources`);
console.log(`  ✓ ServiceCard '${persistCard.id}' visible en catálogo general /api/discovery/resources`);

const searchQuery = "Oracle Price Feed";
const searchRes = await fetch(`${SEARCH_URL}?query=${encodeURIComponent(searchQuery)}`);
assert.equal(searchRes.status, 200);
const searchData = await searchRes.json();
assert.equal(searchData.ok, true);
assert.ok(Array.isArray(searchData.results));
const foundInSearch = searchData.results.find((r) => r.resource.id === persistCard.id);
assert.ok(foundInSearch, `La ServiceCard registrada '${persistCard.id}' debe ser encontrada por la búsqueda léxica`);
assert.ok(foundInSearch.score > 0);
console.log(`  ✓ Búsqueda de '${searchQuery}' indexó la tarjeta con score: ${foundInSearch.score}`);

console.log("\n===============================================================");
console.log("✅ TODAS LAS PRUEBAS DE INGESTA Y CONFORMANCE DE PROVIDERS PASARON (100% PASS)");
console.log("===============================================================\n");