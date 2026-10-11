import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MCP_TOOLS } from '../lib/mcp-tool-contract.ts';
import { skillDocument } from '../lib/bazaar-skills.ts';
import { WORKSPACE_LIMITS } from '../lib/workspace-types.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const buyer = read('public/BUYER.md');
const universal = read('public/AGENT_CONNECTION.md');
const discovery = read('public/llms.txt');
const canonical = skillDocument('buyer');
const recovery = skillDocument('recovery');

// Check the actionable native lifecycle, independent of list numbering or UI
// variable names. Discovery and payment use different transports in one flow.
const lifecycle = ['create_market_order', 'PAYMENT-REQUIRED', 'PAYMENT-SIGNATURE', 'get_market_order'];
const offsets = lifecycle.map(term => buyer.indexOf(term));
assert(offsets.every(offset => offset >= 0), 'Buyer guide must cover order, challenge, authorization and recovery');
assert(offsets.every((offset, index) => index === 0 || offset > offsets[index - 1]), 'Buyer steps must preserve the payment lifecycle');
for (const tool of ['get_bazaar_capabilities', 'get_bazaar_identity', 'list_market_services', 'create_market_order', 'get_market_order', 'get_market_delivery', 'get_bazaar_query_history']) {
  assert(MCP_TOOLS.includes(tool), `Documented native tool is missing from the MCP contract: ${tool}`);
  assert(discovery.includes(tool), `Native tool is absent from the discovery guide: ${tool}`);
}
assert.match(discovery, /tools\/list/);
assert.match(buyer, /wallet previamente es opcional/);
assert.match(canonical, /vincular previamente una wallet es opcional/);
assert.match(buyer, /pagador se fija en cada orden/);
assert.match(buyer, /precio positivo de la ficha revisada/);
assert.match(buyer, /Convierte el decimal[\s\S]*enteros/);
assert.match(buyer, /Reserva presupuesto durable antes de firmar/);
assert.match(buyer, /una única vez `PAYMENT-SIGNATURE`/);
assert.match(buyer, /Nunca regeneres firma, reenvíes pago ni reinicialices presupuesto/);
assert.match(recovery, /Nunca generes otra autorización, pedido o ejecución/);
assert.match(buyer, /firmante y las claves de wallet permanecen en tu/);
assert.match(universal, /solo tu acceso de agente/);
assert.match(universal, /No envíes tokens en URLs, prompts, código público, logs/);
assert.match(universal, /Tu agente puede consultar/);
assert.match(buyer, /preview protegida[\s\S]*token de agente de Bazaar no[\s\S]*elimina esa protección/i);
assert.match(buyer, /origen HTTPS exacto/);
assert.match(buyer, /pago verificado[\s\S]*estados distintos/i);
assert.match(buyer, /visible[s]? vencen a los siete días/);

const demo = read('public/DEMO_TESTNET.md');
const perIp = Number(demo.match(/globales y (\d+)\/IP\/minuto/)[1]);
assert.equal(perIp, WORKSPACE_LIMITS.demoIngressPerMinute, 'Published per-IP ingress must match the demo profile');
for (const path of ['AGENT_CONNECTION.md', 'BUYER.md', 'SELLER_AGENT_KIT.md', 'DEMO_TESTNET.md', 'MARKETPLACE_PILOT.md']) {
  assert(existsSync(new URL('../public/' + path, import.meta.url)), `Public guide link is missing: ${path}`);
}
console.log('PASS buyer instructions: native lifecycle, optional identity, exact payment, recovery, private transport and preview boundary');
