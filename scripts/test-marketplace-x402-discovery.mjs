import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {marketplacePurchaseDescriptor} from '../lib/marketplace-discovery.ts';
import {parseServiceCardShape} from '../lib/service-card-schema.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {toPaidService,toServiceCard} from '../lib/service-card.ts';

const old=JSON.parse(await readFile('docs/evidence/sprint-marketplace/usdc-sale-manifest.json','utf8'));
const legacy=structuredClone(old.payloads.card),legacyHash=computeCanonicalServiceCardHash(legacy);
assert.equal(legacyHash,old.payloads.cardHash);
assert.equal(marketplacePurchaseDescriptor(legacy,'https://bazaar.browns.studio'),undefined);
const card=structuredClone(legacy);
card.id='guionista-algorithmic-text-x402';
card.payment.marketplace={protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'};
const parsed=parseServiceCardShape(card);assert.equal(parsed.ok,true);assert.deepEqual(parsed.card,card);
const descriptor=marketplacePurchaseDescriptor(card,'https://bazaar.browns.studio');
assert.equal(descriptor.orderCreateUrl,'https://bazaar.browns.studio/api/market/orders');
assert.equal(descriptor.paymentUrlTemplate,'https://bazaar.browns.studio/api/market/orders/{operationId}/x402');
assert.equal(card.url,legacy.url);assert.equal(card.routeTemplate,'/v1/marketplace-text');
assert.deepEqual(toServiceCard(toPaidService(card)),card);
assert.deepEqual(toPaidService(card).payment.marketplace,card.payment.marketplace);
assert.equal(computeCanonicalServiceCardHash(legacy),legacyHash);
assert.equal(marketplacePurchaseDescriptor(card,'http://127.0.0.1:3210').authentication,'workspace-agent');
for(const origin of ['http://evil.example','https://bazaar.browns.studio/','https://bazaar.browns.studio?secret=1','https://user:pass@bazaar.browns.studio'])assert.throws(()=>marketplacePurchaseDescriptor(card,origin));
for(const resourceTemplate of ['https://evil.example/pay','/api/market/orders/{operationId}/x402?secret=1']){
  const malicious=structuredClone(card);malicious.payment.marketplace.resourceTemplate=resourceTemplate;
  assert.equal(parseServiceCardShape(malicious).ok,false);
  assert.throws(()=>marketplacePurchaseDescriptor(malicious,'https://bazaar.browns.studio'));
}
const changed=structuredClone(card);changed.payment.identity.issuer=old.participants[0].wallet;
assert.throws(()=>marketplacePurchaseDescriptor(changed,'https://bazaar.browns.studio'));
console.log(JSON.stringify({status:'PASS',legacyHashPreserved:true,providerOriginPreserved:true,marketplaceEndpointBound:true,remoteRequests:0}));
