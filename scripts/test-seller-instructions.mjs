import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseServiceCardShape } from '../lib/service-card-schema.ts';
import { MCP_TOOLS } from '../lib/mcp-tool-contract.ts';
import { skillDocument } from '../lib/bazaar-skills.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const guide = read('public/PROVIDER_ONBOARDING.md');
const kit = read('public/SELLER_AGENT_KIT.md');
const canonical = skillDocument('seller');
const discovery = read('public/llms.txt');
const [native, legacy] = guide.split('## Compatibilidad: recorrido anterior de solicitudes');
assert(legacy, 'Legacy provider contract must be visibly separated from native marketplace onboarding');
assert.match(native, /cuenta gratuita en `\/open`/);
assert.match(native, /market:submit[\s\S]*Mis servicios[\s\S]*\/history/);
assert(!native.includes('no requiere crear una cuenta'), 'Native submission requires its own account and permission');
assert.match(legacy, /no es el alta del marketplace actual/);
assert.match(canonical, /Mis servicios de \/history/);
assert(!canonical.includes('acceso humano en /open'));
assert.match(kit, /Mis servicios[\s\S]*\/history/);
assert.match(kit, /Linking a wallet[\s\S]*optional/);

for (const tool of ['submit_market_service', 'get_market_submission', 'list_market_orders', 'claim_market_order', 'deliver_market_order', 'uncertain_market_order']) {
  assert(MCP_TOOLS.includes(tool), `Native seller tool is absent from the MCP contract: ${tool}`);
  assert(discovery.includes(tool), `Native seller tool is absent from discovery instructions: ${tool}`);
  assert(canonical.includes(tool), `Canonical skill omits seller lifecycle step: ${tool}`);
}
assert.match(native, /revisión manual[\s\S]*Sólo una ficha activada/);
assert.match(native, /después del pago verificado/);
assert.match(canonical, /marcador durable antes de ejecutar/);
assert.match(canonical, /nunca vuelve a ejecutar al proveedor/);
assert.match(kit, /lost provider response[\s\S]*must never cause another provider execution/);
assert.match(kit, /repeated trigger/);
assert.match(kit, /protected preview[\s\S]*does not remove that protection/i);
assert.match(kit, /no provider needs the operator's Vercel credentials/);
assert.match(kit, /You never receive R2 keys or the buyer's credentials/);
assert.match(kit, /manual review/);

// Keep the compatibility example usable without treating it as native acceptance.
const example = JSON.parse(legacy.match(/```json\s*([\s\S]*?)```/)[1]);
assert.equal(parseServiceCardShape(example).ok, true, 'Legacy minimum example must still satisfy the card schema');
assert.match(legacy, /submissionToken/);
assert.match(legacy, /24 horas/);
assert.match(legacy, /no es autopublicación/);
assert.match(legacy, /no realiza solicitudes de red, pagos ni publicación/);
console.log('PASS seller instructions: account consent, native lifecycle, manual activation, durable recovery and separated legacy example');
