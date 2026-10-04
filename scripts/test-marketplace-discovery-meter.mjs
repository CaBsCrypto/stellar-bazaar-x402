import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {measuredHandler, measuredRead, meteredRedis} from '../lib/acceptance-meter.ts';
import {services, getService} from '../lib/catalog.ts';
import {filterServices, rankServices} from '../lib/discovery.ts';
import {toServiceCard, toPaidService} from '../lib/service-card.ts';
import {parseServiceCardShape} from '../lib/service-card-schema.ts';
import {paymentLabel} from '../lib/payment-options.ts';
import {isCanonicalUsdcTestnet, USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';

process.env.BAZAAR_ACCEPTANCE_METER = 'true';
process.env.BAZAAR_ENABLE_MARKETPLACE = 'true';
process.env.BAZAAR_WORKSPACE_PREFIX = 'bazaar-workspace:pilot-' + 'b'.repeat(32);
const prefix = 'bazaar-market:pilot-' + 'b'.repeat(32) + ':catalog';
const card = {...toServiceCard(services[0]), id: 'guionista-text', name: 'Guionista algorítmico de texto', payment: {scheme: 'exact', asset: 'USDC', amount: '0.01', destination: services[0].payment.destination, identity: USDC_TESTNET_PAYMENT_IDENTITY}};
assert(parseServiceCardShape(card).ok);
let middleware, redisCalls = 0;
meteredRedis({use(fn) {middleware = fn;}});
const command = body => middleware({body}, async () => {redisCalls++; return {result: 1};});
const registry = {async readDynamicServiceCards() {await command(['smembers', prefix + ':index']); await command(['mget', prefix + ':card:' + card.id]); return {available: true, entries: [{id: card.id, card}]};}};
const jsx = (type, props) => ({type, props});
const common = {
  'next/server': {NextResponse: Response}, '@/lib/catalog': {services, getService}, '@/lib/discovery': {filterServices, rankServices},
  '@/lib/service-card': {toServiceCard, toPaidService}, '@/lib/dynamic-registry': registry,
  '@/lib/acceptance-meter': {measuredHandler, measuredRead}, '@/lib/service-card-schema': {parseServiceCardShape},
  '@/lib/payment-assets': {isCanonicalUsdcTestnet}, '@/lib/payment-options': {paymentLabel},
};
function load(path) {
  const module = {exports: {}};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(compiled, {module, exports: module.exports, process, console, encodeURIComponent, require(name) {
    if (name in common) return common[name];
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'next/navigation') return {notFound() {throw Error('NOT_FOUND');}};
    if (name === '@/lib/service-portfolio') return {getServicePortfolio: () => undefined};
    if (name.startsWith('@/components/')) return new Proxy({}, {get: (_, symbol) => String(symbol)});
    if (name.endsWith('.css')) return {};
    throw Error('Unexpected dependency ' + name);
  }});
  return module.exports;
}
const request = path => ({nextUrl: new URL('https://preview.example' + path)});
const resources = load('app/api/discovery/resources/route.ts');
const response = await resources.GET(request('/api/discovery/resources'));
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(response.headers.get('x-bazaar-redis-requests'), '2');
const body = await response.json();
assert.equal(body.results.find(item => item.id === card.id).payment.asset, 'USDC');
assert.deepEqual(body.results.find(item => item.id === card.id).payment.identity, USDC_TESTNET_PAYMENT_IDENTITY);
assert(body.results.some(item => item.id === services[0].id), 'Old static catalog is retained');
const search = load('app/api/discovery/search/route.ts');
const matched = await search.GET(request('/api/discovery/search?query=guionista'));
assert.equal(matched.headers.get('x-bazaar-redis-requests'), '2'); assert.equal(matched.headers.get('cache-control'), 'no-store');
assert((await matched.json()).results.some(item => item.resource.id === card.id));
const invalid = await search.GET(request('/api/discovery/search'));
assert.equal(invalid.status, 400); assert.equal(invalid.headers.get('x-bazaar-redis-requests'), '0');
assert.equal(invalid.headers.get('cache-control'), 'no-store');
const page = load('app/resources/[id]/page.tsx');
const info = console.info, logs = [];
console.info = value => logs.push(JSON.parse(value));
let tree;
try {tree = await page.default({params: Promise.resolve({id: card.id})});} finally {console.info = info;}
function nodes(node) {if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)];}
assert(nodes(tree).some(node => node.type === 'a' && node.props.href === '/history?service=guionista-text'));
const ssr = logs.find(log => log.source === 'ssr'); assert(ssr); assert.equal(ssr.redis, 2); assert.equal(ssr.commandsUpperBound, 2);
assert.equal(redisCalls, 6); assert(!JSON.stringify(logs).includes(card.id), 'Counter logs contain no record content or keys');
console.log('PASS discovery API + resource SSR run actual meter scopes, no-store, preserve canonical USDC identity and old catalog, and expose authenticated purchase entry. Redis middleware double only; no external requests.');
