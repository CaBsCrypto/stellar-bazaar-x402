import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {createPrivateReadQueue} from '../lib/private-read-queue.ts';

const compiled = ts.transpileModule(readFileSync('components/MarketplaceWorkspace.tsx', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
const identity = {kind: 'stellar-classic-credit', network: 'stellar:testnet', code: 'USDC', issuer: 'CIRCLE_TESTNET_ISSUER', sacContract: 'USDC_TESTNET_SAC'};
const service = name => ({submissionId: 'service-submission', cardHash: 'card-hash', status: 'activated', card: {id: 'guionista-text', name, description: 'Generación algorítmica', payment: {asset: 'USDC', amount: '0.01', destination: 'SELLER_ACCOUNT', identity}, input: [{name: 'tema', type: 'string', required: true}]}});
const order = (name, phase = 'awaiting-payment') => ({operationId: 'order-id', perspective: 'purchase', card: service(name).card, amount: '0.01', payer: 'BUYER_ACCOUNT', destination: 'SELLER_ACCOUNT', settlement: identity, updatedAt: '2026-10-04T00:00:00Z', phase});
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((r, j) => {resolve = r; reject = j;}); return {promise, resolve, reject}; }
function harness(search = '') {
  const slots = [], effects = [], requests = [], walletRequests = [], signatures = [];
  let cursor = 0, tree, props = {access: 'synthetic-owner-a', onLock: () => locks++}, locks = 0;
  const serializedPrivateRead=createPrivateReadQueue();
  const hooks = {
    useState(initial) {const i = cursor++; if (!(i in slots)) slots[i] = {value: initial}; return [slots[i].value, value => {slots[i].value = typeof value === 'function' ? value(slots[i].value) : value;}];},
    useRef(initial) {const i = cursor++; return slots[i] ??= {current: initial};},
    useEffect(fn, deps) {const i = cursor++; const prior = slots[i]; if (!prior || deps.some((v, j) => v !== prior.deps[j])) effects.push(() => {prior?.cleanup?.(); slots[i] = {deps, cleanup: fn()};});},
  };
  const jsx = (type, props) => ({type, props}), module = {exports: {}};
  vm.runInNewContext(compiled, {
    module, exports: module.exports, AbortController, AbortSignal, DOMException, URLSearchParams, URL, Blob,
    window: {location: {search}}, crypto: {randomUUID: () => 'synthetic-new-order'},
    document: {createElement: () => ({click() {}})},
    fetch(url, options) {const waiting = deferred(); requests.push({url, options, ...waiting}); return waiting.promise;},
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
      if (name === './MarketplaceWorkspace.module.css') return {default: {}};
      if (name === '../lib/private-read-queue') return {serializedPrivateRead};
      if (name === '../lib/payment-assets') return {isCanonicalUsdcTestnet: value => JSON.stringify(value) === JSON.stringify(identity), USDT0_MAINNET_DESCRIPTOR: {identity: {code: 'USDT0'}}};
      if (name === '@stellar/freighter-api') return {
        requestAccess() {const pending = deferred(); walletRequests.push(pending); return pending.promise;},
        getNetworkDetails: async () => ({networkPassphrase: 'Test SDF Network ; September 2015'}),
        signTransaction() {const pending = deferred(); signatures.push(pending); return pending.promise;},
      };
      throw Error('Unexpected module ' + name);
    },
  });
  function render() {cursor = 0; tree = module.exports.default(props); while (effects.length) effects.shift()(); return tree;}
  function nodes(node) {if (arguments.length === 0) node = tree; if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); if (typeof node.type === 'function') return nodes(node.type(node.props)); return [node, ...nodes(node.props?.children)];}
  function text(node) {if (arguments.length === 0) node = tree; if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(text).join(''); if (typeof node !== 'object') return String(node); return text(typeof node.type === 'function' ? node.type(node.props) : node.props?.children);}
  function button(label) {const found = nodes().find(v => v.type === 'button' && text(v) === label); assert(found, 'Missing button ' + label); return found;}
  function file(index) {return nodes().filter(v => v.type === 'input' && v.props.type === 'file')[index];}
  async function answer(index, value, ok = true) {requests[index].resolve({ok, json: async () => value}); await tick(); render();}
  function switchAccess() {props = {...props, access: 'synthetic-owner-b'}; render(); render();}
  return {requests, walletRequests, signatures, render, nodes, text, button, file, answer, switchAccess, locks: () => locks, clean: () => slots.forEach(v => v?.cleanup?.())};
}
async function populated(name = 'Servicio A', history = []) {
  const h = harness('?service=guionista-text'); h.render();
  assert.equal(h.requests.length, 1, 'History must wait for catalog quota update');
  await h.answer(0, {services: [service(name)], mine: [], paused: false});
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].url, '/api/market/orders');
  await h.answer(1, {orders: history});
  for (const request of h.requests) {
    assert.equal(request.options.credentials, 'same-origin'); assert.equal(request.options.redirect, 'error'); assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.headers.Authorization, 'Bearer synthetic-owner-a');
  }
  return h;
}
{
  const h = await populated('Guionista USDC', [order('Guionista USDC'), order('Entrega incierta', 'execution-uncertain')]);
  assert.match(h.text(), /Comprar Guionista USDC/); assert.match(h.text(), /0\.01 USDC testnet/);
  assert.match(h.text(), /CIRCLE_TESTNET_ISSUER/); assert.match(h.text(), /USDC_TESTNET_SAC/); assert.match(h.text(), /ejecución incierta/);
  assert.match(h.text(), /USDT0 está preparado para mainnet y sus pagos permanecen desactivados/);
  assert.equal(h.nodes().filter(v => v.type === 'button' && h.text(v).includes('Firmar y pagar')).length, 1);
  assert(!h.text().includes('0.01 XLM')); h.clean();
}
{
  const h = harness(); h.render(); h.switchAccess(); assert(h.requests[0].options.signal.aborted);
  await h.answer(0, {services: [service('Viejo dueño')], mine: [], paused: false});
  assert.equal(h.requests.length, 2, 'A late catalog cannot start the old owner history request');
  await h.answer(1, {services: [service('Nuevo dueño')], mine: [], paused: false}); await h.answer(2, {orders: []});
  assert(h.text().includes('Nuevo dueño')); assert(!h.text().includes('Viejo dueño'));
  assert.equal(h.requests[2].options.headers.Authorization, 'Bearer synthetic-owner-b'); h.clean();
}
{
  const h = await populated(); const pending = deferred();
  h.file(1).props.onChange({target: {files: [{size: 200, text: () => pending.promise}], value: 'file'}});
  h.button('Bloquear espacio').props.onClick(); h.render();
  pending.resolve(JSON.stringify({submissionId: 'late-submission', card: service('private stale card').card})); await tick(); h.render();
  assert.equal(h.locks(), 1); assert(!h.text().includes('late-submission')); assert(!h.text().includes('Servicio A')); assert(!h.nodes().some(v => v.props.role === 'alert')); h.clean();
}
{
  const h = await populated(); const pending = deferred();
  h.file(1).props.onChange({target: {files: [{size: 200, text: () => pending.promise}], value: 'file'}}); h.switchAccess();
  pending.resolve('malformed late JSON'); await tick(); h.render(); assert(!h.nodes().some(v => v.props.role === 'alert')); h.clean();
}
{
  const h = await populated(); h.button('Conectar Freighter en testnet').props.onClick(); await tick();
  assert.equal(h.walletRequests.length, 1); h.switchAccess(); h.walletRequests[0].resolve({error: {message: 'late rejection'}}); await tick(); h.render();
  assert(!h.nodes().some(v => v.props.role === 'alert')); assert(!h.text().includes('WALLET_CONNECTION_REJECTED')); h.clean();
}
{
  const h = await populated('Guionista', [order('Guionista')]); h.button('Firmar y pagar 0.01 USDC testnet con Freighter').props.onClick();
  await h.answer(2, {payment: {unsignedXdr: 'synthetic-unsigned'}}); await tick(); assert.equal(h.signatures.length, 1);
  h.button('Bloquear espacio').props.onClick(); h.signatures[0].resolve({error: {message: 'late signing error'}}); await tick(); h.render();
  assert.equal(h.requests.length, 3, 'No payment may be sent after locking'); assert(!h.nodes().some(v => v.props.role === 'alert')); h.clean();
}
{
  const h = await populated(); h.button('Actualizar marketplace').props.onClick(); h.button('Bloquear espacio').props.onClick();
  await h.answer(2, {error: {code: 'OLD_OWNER_ERROR'}}, false);
  assert.equal(h.requests.length, 3); assert(!h.text().includes('OLD_OWNER_ERROR')); assert(!h.text().includes('requiere comprobación')); h.clean();
}
console.log('PASS marketplace actual component hooks: sequential owner reads, USDC identity and disabled USDT0, private service entry, stale HTTP/file/wallet/signature rejection after lock or access change. No browser, Redis or ledger calls.');
