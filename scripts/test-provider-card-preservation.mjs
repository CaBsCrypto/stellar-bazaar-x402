import assert from 'node:assert/strict';
import { toPaidService, toServiceCard } from '../lib/service-card.ts';
import { providerRequestUrl } from '../lib/provider-request-url.ts';
import { rankServices } from '../lib/discovery.ts';

const card = {
  version: 'bazaar.service-card/v0', id: 'external-owner', name: 'External reports',
  description: 'Independent provider reports', kind: 'http',
  url: 'https://provider.example', routeTemplate: '/reports/{topic}',
  input: [{ name: 'topic', type: 'string', required: true }, {name:'verbose',type:'boolean',required:false}],
  network: 'stellar:testnet', payment: {scheme:'exact',asset:'USDC',amount:'0.001',destination:'GAHOZFSDG2DW32FOUUP6XA4SMN3OCR7NOUXHAPYFN47BLJX56GJ3WCSM'},
  provider:{name:'External owner'},tags:['reports'],
};
const view = toPaidService(card);
assert.deepEqual(toServiceCard(view), card, 'Full card must survive list/get conversions');
assert.deepEqual(toServiceCard(rankServices([view], 'reports')[0].service), card, 'Ranking must preserve provider terms');
const returned = toServiceCard(view);
returned.payment.destination = 'mutated';
assert.equal(toServiceCard(view).payment.destination, card.payment.destination, 'Returned metadata is isolated');
assert.equal(providerRequestUrl(card,{topic:'hello world'}),'https://provider.example/reports/hello%20world');
assert.throws(()=>providerRequestUrl({...card,routeTemplate:'https://elsewhere.example/pay'},{}),/PROVIDER_ORIGIN_MISMATCH/);
assert.throws(()=>providerRequestUrl(card,{}),/MISSING_PROVIDER_INPUT/);
for (const topic of ['.', '..', '%2e%2e', '../other', 'a\\b']) {
  assert.throws(()=>providerRequestUrl(card,{topic}),/INVALID_PROVIDER_PATH_INPUT/);
}
assert.throws(()=>providerRequestUrl({...card,routeTemplate:'/reports/%2e%2e'},{}),/INVALID_PROVIDER_PATH_INPUT/);
const {sourceCard, ...legacy} = view;
delete legacy.payment.destination;
assert.equal(toServiceCard(legacy).payment.destination,'','Missing seller must not default to treasury');
console.log('Provider card preservation and path binding assertions passed; no network/payment.');
