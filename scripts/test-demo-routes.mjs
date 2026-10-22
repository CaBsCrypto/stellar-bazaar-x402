import assert from 'node:assert/strict';
import {pilotRoutePolicy} from '../lib/pilot-route-policy.ts';
process.env.BAZAAR_PUBLIC_DEMO='true';
process.env.BAZAAR_ENABLE_MARKETPLACE='true';
const order='00000000-0000-4000-8000-000000000001';
for(const page of ['/demo','/storage','/demo-qr.svg','/bazaar-qr.svg','/market-operations','/AGENT_CONNECTION.md'])for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy(page,method),'allow');
for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy('/',method),'allow');
const illustrations=['/demo-deliveries/afiche-orbita.png','/demo-deliveries/afiche-pulso.png','/demo-deliveries/clip-demostracion.mp4','/demo-deliveries/subtitulos.vtt'];
for(const path of illustrations){
 for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy(path,method),'allow');
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal(pilotRoutePolicy(path,method),'deny');
}
for(const path of ['/demo-deliveries/unknown.png','/demo-deliveries/video.mp4','/demo-deliveries/afiche-orbita.png/extra','/demo-deliveries/../afiche-orbita.png','/demo-deliveries/%2e%2e/afiche-orbita.png','/demo-deliveries/%61fiche-orbita.png','/deliverables/private.png','/api/deliveries/private-file','/api/discovery/resources','/api/discovery/search'])for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy(path,method),'deny');
for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal(pilotRoutePolicy('/',method),'deny');
assert.equal(pilotRoutePolicy('/api/market/capacity','POST'),'allow');
assert.equal(pilotRoutePolicy('/api/market/capacity','GET'),'deny');
for(const method of ['GET','POST']){
 assert.equal(pilotRoutePolicy(`/api/market/orders/${order}/deliveries`,method),'allow');
 assert.equal(pilotRoutePolicy('/api/market/guardian',method),'allow');
}
assert.equal(pilotRoutePolicy(`/api/market/orders/${order}/deliveries/confirm`,'POST'),'allow');
assert.equal(pilotRoutePolicy('/api/market/guardian/tick','GET'),'allow');
for(const [path,method] of [[`/api/market/orders/${order}/deliveries/confirm`,'GET'],['/api/market/guardian/tick','POST'],['/api/buyer-execution/reference','POST'],['/api/deliveries/uploads','POST'],['/api/deliveries/confirm','POST']])assert.equal(pilotRoutePolicy(path,method),'deny');
delete process.env.BAZAAR_ENABLE_MARKETPLACE;
for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy('/',method),'redirect');
for(const path of illustrations)for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy(path,method),'deny');
assert.equal(pilotRoutePolicy(`/api/market/orders/${order}/deliveries`,'POST'),'deny');
process.env.BAZAAR_PUBLIC_DEMO='false';process.env.BAZAAR_ENABLE_MARKETPLACE='true';
for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy('/',method),'allow');
delete process.env.BAZAAR_ENABLE_MARKETPLACE;
for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy('/',method),'redirect');
console.log(JSON.stringify({ok:true,case:'native marketplace landing and exact illustration files pass; demo-only and pilot redirects, private/API boundaries preserved'}));
