import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as selection from '../lib/service-selection.ts';
import * as pilotAccess from '../lib/pilot-access.ts';

const origin = 'https://preview.example.test', serviceId = 'synthetic-reviewed-text-v1';
for (const value of [null, undefined, ['two-services'], 'x'.repeat(101), '-', 'a--b', '-a', 'a-', '../other', 'a?token=secret', 'a#token=secret', 'https://other.test', '<script>', 'a b', 'UPPERCASE']) {
  assert.equal(selection.selectedServiceId(value), undefined);
  assert.equal(selection.serviceSelectionHref('/hub', value), '/hub');
}
for (const path of ['/hub', '/open', '/history', '/catalogo']) {
  const url = new URL(selection.serviceSelectionHref(path, serviceId), origin);
  assert.equal(url.pathname, path);
  assert.deepEqual([...url.searchParams], [['service', serviceId]]);
  assert.equal(url.hash, '');
}
const prompt = selection.buyerAgentInstructions(origin, serviceId);
assert(prompt.includes(serviceId)); assert(prompt.includes('get_service'));
assert(prompt.includes('hash, precio, red, entrega y disponibilidad'));
assert(prompt.includes('autorización explícita')); assert(prompt.includes('no autoriza un pago'));
assert(prompt.indexOf('get_service') < prompt.indexOf('create_market_order'));
assert(!prompt.includes('Bearer')); assert(!prompt.includes('#token='));
assert(selection.buyerAgentInstructions(origin).includes('Ayúdame a comparar opciones'));
assert(!selection.buyerAgentInstructions(origin, '<script>').includes('<script>'));

// Execute the real client component with React hook and browser doubles.
// This exercises selection continuity without a hosted account, order or payment.
function clientHarness(path, dependencies, extras = {}) {
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, URL, URLSearchParams, TextEncoder, AbortController,
    crypto: webcrypto, btoa: text => Buffer.from(text, 'binary').toString('base64'),
    location: { origin }, setTimeout: () => 1, clearTimeout: () => {},
    ...extras,
    require(name) {
      if (name === 'react') return {
        useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; },
        useRef(initial) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
        useEffect(callback) { effects[effectIndex++] = callback; },
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name in dependencies) return dependencies[name];
      throw Error('Unexpected dependency: ' + name);
    },
  };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, context);
  return { states, effects, context, render(name, props) { stateIndex = refIndex = effectIndex = 0; return module.exports[name](props); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return tree && typeof tree === 'object' ? textOf(tree.props?.children) : String(tree ?? '');
}
function button(tree, label) {
  const result = nodes(tree).find(node => node.type === 'button' && textOf(node) === label);
  assert(result, `Missing button: ${label}`); return result;
}
const shared = {
  '@/lib/service-selection': selection,
  './SelectedServiceContext': { SelectedServiceContext: 'selection-context' },
  './useBazaarOrigin': { useBazaarOrigin: () => origin },
  './ui/CopyText': { CopyText: 'copy-text' },
};
const buyerCard = clientHarness('components/AgentDirectConnectCard.tsx', {
  '@/lib/service-selection': selection,
  '@/components/useBazaarOrigin': { useBazaarOrigin: () => origin },
  '@/components/ui/CopyText': { CopyText: 'copy-text' }, '@/components/ui': { ButtonLink: 'button-link' },
});
let buyerTree = buyerCard.render('AgentDirectConnectCard', { serviceId });
assert.equal(nodes(buyerTree).find(node => node.type === 'copy-text').props.text, prompt);
assert(nodes(buyerTree).some(node => node.props?.href === `/open?service=${serviceId}`));
assert(nodes(buyerTree).some(node => node.props?.href === `/history?service=${serviceId}`));
const hub = clientHarness('components/AgentHub.tsx', {
  ...shared, './AgentDirectConnectCard': { AgentDirectConnectCard: 'buyer-card' },
  './ui': { ButtonLink: 'button-link', Card: 'card' },
});
let hubTree = hub.render('AgentHub', { serviceId });
assert(nodes(hubTree).some(node => node.type === 'buyer-card' && node.props.serviceId === serviceId));
hub.states[0] = 2; hubTree = hub.render('AgentHub', { serviceId });
assert(nodes(hubTree).some(node => node.props?.href === `/open?service=${serviceId}`));
const publicConfigText = nodes(hubTree).find(node => node.type === 'copy-text' && node.props.label === 'Configuración MCP pública').props.text;
assert.deepEqual(JSON.parse(publicConfigText), { mcpServers: { bazaar: { type: 'http', url: `${origin}/api/mcp` } } });
const downloads = [], blobs = new Map(); let requests = 0;
const urlDouble = Object.assign(class extends URL {}, { createObjectURL(blob) { const id = `blob:synthetic-${blobs.size}`; blobs.set(id, blob); return id; }, revokeObjectURL() {} });
const onboarding = clientHarness('components/PilotOnboarding.tsx', {
  ...shared, '@/lib/pilot-access': pilotAccess, './PilotOnboarding.module.css': { default: {} },
}, {
  URL: urlDouble, Blob,
  document: { createElement(kind) { assert.equal(kind, 'a'); return { click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); } }; } },
  async fetch(url, options) {
    requests++; assert.equal(url, '/api/workspaces');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body); assert.equal(body.service, undefined); assert.equal(body.serviceId, undefined);
    assert.deepEqual(Object.keys(body).sort(), ['agentAccessHash', 'creationId', 'humanAccessHash']);
    return { ok: true, json: async () => ({ version: '1', record: { workspaceId: '00000000-0000-4000-8000-000000000001', creationId: body.creationId, generation: 1, revoked: false } }) };
  },
});
const props = { enabled: true, serviceId };
let tree = onboarding.render('default', props);
assert.equal(requests, 0); assert(nodes(tree).some(node => node.props?.href === `/history?service=${serviceId}`));
button(tree, 'Preparar mi acceso privado').props.onClick();
tree = onboarding.render('default', props);
button(tree, 'Descargar archivo de recuperación').props.onClick();
tree = onboarding.render('default', props);
const check = nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox'); check.props.onChange({ target: { checked: true } });
tree = onboarding.render('default', props);
await button(tree, 'Crear mi espacio').props.onClick();
// The UI callback starts the asynchronous request without returning its promise.
for (let i = 0; i < 100 && !onboarding.states[3]; i++) await new Promise(resolve => setTimeout(resolve, 5));
tree = onboarding.render('default', props);
assert.equal(requests, 1);
const access = JSON.parse(await downloads[0].blob.text());
assert.deepEqual(Object.keys(access).sort(), ['agent', 'bootstrap', 'creationId', 'human', 'origin', 'version']);
pilotAccess.parsePilotAccess(JSON.stringify(access), origin);
const privateLink = nodes(tree).find(node => textOf(node) === 'Abrir mi espacio privado' && node.type === 'a');
assert(privateLink); const privateUrl = new URL(privateLink.props.href);
assert.equal(privateUrl.searchParams.get('service'), serviceId); assert.equal(privateUrl.searchParams.get('token'), null);
assert.equal(new URLSearchParams(privateUrl.hash.slice(1)).get('token'), access.human);
button(tree, 'Descargar configuración privada del agente').props.onClick();
const config = JSON.parse(await downloads[1].blob.text());
assert.deepEqual(config, { mcpServers: { bazaar: { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${access.agent}` } } } });
for (const token of [access.human, access.agent, access.bootstrap]) assert(!prompt.includes(token));

// Opening the human fragment removes the credential and keeps the public selection.
let currentUrl = privateUrl.href, replaced;
const history = clientHarness('components/HistoryEntry.tsx', {
  ...shared, 'next/dynamic': { default: () => 'operation-history' },
  './DeliverableReview': { DeliverableReview: 'deliverable-review' }, './Navbar': { Navbar: 'navbar' },
  './Footer': { Footer: 'footer' }, './Breadcrumbs': { Breadcrumbs: 'breadcrumbs' }, './ui': { Button: 'button' },
  './DemoAccount': { default: 'demo-account' }, './MarketplaceWorkspace': { default: 'market-workspace' },
  '../lib/pilot-access': pilotAccess,
}, {
  window: { location: { get href() { return currentUrl; } }, history: { state: {}, replaceState(_state, _title, href) { replaced = href; currentUrl = origin + href; } }, addEventListener() {}, removeEventListener() {} },
});
history.render('HistoryEntry', { marketEnabled: true, serviceId }); history.effects[0]();
tree = history.render('HistoryEntry', { marketEnabled: true, serviceId });
assert.equal(replaced, `/history?service=${serviceId}`);
assert(nodes(tree).some(node => node.type === 'selection-context' && node.props.serviceId === serviceId && node.props.connect));
assert(nodes(tree).some(node => node.type === 'market-workspace' && node.props.access === access.human));
nodes(tree).find(node => node.type === 'market-workspace').props.onLock();
tree = history.render('HistoryEntry', { marketEnabled: true, serviceId });
assert(nodes(tree).some(node => node.props?.href === `/open?service=${serviceId}`));
assert(!nodes(tree).some(node => node.props?.access === access.human));
const capsuleInput = nodes(tree).find(node => node.type === 'input' && node.props.type === 'file');
await capsuleInput.props.onChange({ currentTarget: { value: 'synthetic-file', files: [{ size: JSON.stringify(access).length, text: async () => JSON.stringify(access) }] } });
tree = history.render('HistoryEntry', { marketEnabled: true, serviceId });
assert(nodes(tree).some(node => node.type === 'market-workspace' && node.props.access === access.human));
assert(nodes(tree).some(node => node.type === 'selection-context' && node.props.serviceId === serviceId));
assert.equal(requests, 1, 'Navigation must not create orders or payments');
console.log('PASS service selection: invalid/duplicate query rejection, real buyer card and MCP hub wiring, public prompt and approval, real onboarding selection through account creation, unchanged recovery/config schema, fragment-only human access, history credential removal and file recovery. Synthetic browser and network doubles; no hosted account, order or payment.');
