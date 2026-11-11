import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {selectedServiceId} from '../lib/service-selection.ts';

const nextTick = () => new Promise(resolve => setImmediate(resolve));
const jsx = (type, props) => ({type, props});
const language = {useUiLanguage: () => ({language: 'es', t: value => value}), UiText: 'ui-text', UiServiceName: 'service-name', UiServiceDescription: 'service-description', LanguageSwitch: 'language-switch'};
const storage = {getItem() { throw Error('Private access must stay in memory'); }, setItem() { throw Error('Private access must stay in memory'); }};

function component(path, exportName, imports, globals) {
  const input = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(input, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
  const state = [], refs = [], effects = [], module = {exports: {}};
  let si, ri, ei;
  const react = {
    useState(initial) {
      const i = si++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }];
    },
    useRef(initial) { const i = ri++; return refs[i] ?? (refs[i] = {current: initial}); },
    useEffect(effect) { effects[ei++] = effect; },
  };
  const dependencies = {react, 'react/jsx-runtime': {jsx, jsxs: jsx, Fragment: 'fragment'}, '@/components/UiLanguage': language, ...imports};
  vm.runInNewContext(code, {module, exports: module.exports, URL, URLSearchParams, AbortController, Response, Date, Blob,
    localStorage: storage, sessionStorage: storage, setTimeout: () => 1, clearTimeout() {}, ...globals,
    require(id) { assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`); return dependencies[id]; },
  });
  return {effects, render: (props = {}) => { si = ri = ei = 0; return module.exports[exportName](props); }};
}

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  if (!tree || typeof tree !== 'object') return undefined;
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function click(view, label) {
  const node = find(view.render(), n => n.type === 'button' && (n.props.children === label || n.props.children?.props?.text === label));
  assert.ok(node && !node.props.disabled, `Missing enabled button: ${label}`);
  node.props.onClick();
}

const origin = 'https://bazaar-preview.example.invalid';
const publishedAt = '2026-10-22T00:00:00.000Z';
const service = {submissionId: 'fixture-submission', card: {id: 'fixture-service', name: 'Fixture service', description: 'Fixture only', tags: [], input: [], payment: {amount: '0.01', asset: 'USDC'}}, cardHash: 'a'.repeat(64), status: 'activated', statusAsOf: publishedAt, liveAvailabilityVerified: false, purchaseAdmissionVerified: false, availability: {verified: false, reason: 'LIVE_CHECK_REQUIRED'}};
const snapshot = {version: 'bazaar.public-catalogue-snapshot/v1', revision: 'b'.repeat(64), asOf: publishedAt, publishedAt, liveAvailabilityVerified: false, purchaseAdmissionVerified: false};
let catalogueCalls = 0;
const catalogue = component('components/MarketCatalog.tsx', 'MarketCatalog', {'@/lib/delivery-contract': {deliveryStorage: () => ({mode: 'text'})}, './ui': {ButtonLink: 'a', SectionHeading: 'heading'}, './MarketCatalog.module.css': {}}, {
  fetch: async (path, init) => {
    catalogueCalls++;
    assert.equal(path, '/api/market/catalog?limit=10');
    assert.deepEqual({...init.headers}, {'X-Bazaar-Catalogue-View': 'published'});
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    // Model Preview authentication: the signed-in browser only sends its
    // protection cookie with a same-origin request using credentials.
    return init.credentials === 'same-origin'
      ? Response.json({services: [service], catalogueSnapshot: snapshot, nextCursor: null, partialResults: false})
      : new Response('Preview sign-in required', {status: 401});
  },
});
catalogue.render();
catalogue.effects[0]();
await nextTick();
assert.equal(catalogueCalls, 1);
assert.ok(find(catalogue.render(), node => node.type === 'a' && node.props.href === '/resources/fixture-service'), 'Signed-in preview should show the published card');
const purchaseLink = find(catalogue.render(), node => node.type === 'a' && node.props.href === '/hub?service=fixture-service');
assert.ok(purchaseLink, 'The catalogue hands the chosen service to the hub');
const hub = component('app/hub/page.tsx', 'default', {'@/components/Navbar': {Navbar: 'nav'}, '@/components/Footer': {Footer: 'footer'},
  '@/components/AgentHub': {AgentHub: 'agent-hub'}, '@/components/ui': {PageShell: 'shell'}, '@/lib/service-selection': {selectedServiceId},
});
const hubProps = async params => find(await hub.render({searchParams: Promise.resolve(params)}), node => node.type === 'agent-hub').props;
const selected = await hubProps(Object.fromEntries(new URL(purchaseLink.props.href, origin).searchParams));
assert.equal(selected.initialTab, 'buy');
assert.equal(selected.serviceId, service.card.id);
assert.equal((await hubProps({service: service.card.id, tab: 'connect'})).initialTab, 'connect');
assert.equal((await hubProps({service: service.card.id, tab: 'sell'})).initialTab, 'sell');
const invalid = await hubProps({service: '../outside'});
assert.equal(invalid.initialTab, 'connect');
assert.equal(invalid.serviceId, undefined);

const access = {origin, creationId: '11111111-1111-4111-8111-111111111111', human: 'h'.repeat(43), agent: 'a'.repeat(43), bootstrap: 'b'.repeat(43)};
const receipt = {creationId: access.creationId, workspaceId: '22222222-2222-4222-8222-222222222222', ownerId: `ow_${'0'.repeat(32)}`, agentId: `agent_${'0'.repeat(32)}`, generation: 1, revoked: false, createdAt: publishedAt};
let creationCalls = 0;
const onboarding = component('components/PilotOnboarding.tsx', 'default', {
  '@/lib/pilot-access': {createPilotAccess: () => access, pilotHash: async value => value === access.human ? '1'.repeat(64) : '2'.repeat(64)},
  './ui/CopyText': {CopyText: 'copy-text'}, './useBazaarOrigin': {useBazaarOrigin: () => origin}, './PilotOnboarding.module.css': {},
  '@/lib/service-selection': {serviceSelectionHref: path => path}, './SelectedServiceContext': {SelectedServiceContext: 'service-context'},
}, {
  location: {origin}, document: {createElement: () => ({click() {}})},
  fetch: async (path, init) => {
    creationCalls++;
    assert.equal(path, '/api/workspaces');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, `Bearer ${access.bootstrap}`);
    assert.deepEqual(JSON.parse(init.body), {creationId: access.creationId, humanAccessHash: '1'.repeat(64), agentAccessHash: '2'.repeat(64)});
    return Response.json({version: '1', record: receipt}, {status: 201});
  },
});
const privateChatLink = tree => find(tree, node => node.type === 'a' && node.props.children === 'Abrir conversación privada');
assert.equal(privateChatLink(onboarding.render()), undefined);
click(onboarding, 'Preparar mi acceso privado');
click(onboarding, 'Descargar archivo de recuperación');
find(onboarding.render(), n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({target: {checked: true}});
click(onboarding, 'Crear mi espacio');
await nextTick();
assert.equal(creationCalls, 1);
const link = privateChatLink(onboarding.render());
assert.ok(link, 'A validated workspace receipt should make the chat reachable');
assert.equal(link.props.referrerPolicy, 'no-referrer');
const target = new URL(link.props.href);
assert.equal(target.origin, origin);
assert.equal(target.pathname, '/agent-chat');
assert.equal(target.search, '');
assert.equal(target.hash, `#token=${access.human}`);

let chatCalls = 0, scrubbed;
const chat = component('components/PrivateAgentChat.tsx', 'PrivateAgentChat', {}, {
  window: {location: {href: target.href}, addEventListener() {}, history: {replaceState(_state, _title, path) { scrubbed = path; }}},
  fetch: async (path, init) => {
    chatCalls++;
    assert.equal(scrubbed, '/agent-chat', 'Remove the token before requesting private data');
    assert.equal(path, '/api/conversations');
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, `Bearer ${access.human}`);
    return Response.json({conversations: []});
  },
});
assert.ok(find(chat.render(), node => node.type === 'a' && node.props.href === '/open'));
chat.effects.forEach(effect => effect());
await nextTick();
assert.equal(chatCalls, 1);
assert.ok(find(chat.render(), node => node.type === 'button' && node.props.children === 'Crear conversación'));
console.log('PASS market web onboarding: protected preview catalogue, selected buyer flow and private chat handoff using synthetic requests only.');
