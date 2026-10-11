import assert from 'node:assert/strict';
import {pilotRoutePolicy} from '../lib/pilot-route-policy.ts';
process.env.BAZAAR_PUBLIC_DEMO='true';
process.env.BAZAAR_ENABLE_MARKETPLACE='true';
const order='00000000-0000-4000-8000-000000000001';
for(const page of ['/demo','/storage','/demo-qr.svg','/bazaar-qr.svg','/market-operations','/AGENT_CONNECTION.md'])for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy(page,method),'allow');
for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy('/',method),'redirect');
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
assert.equal(pilotRoutePolicy(`/api/market/orders/${order}/deliveries`,'POST'),'deny');
console.log(JSON.stringify({ok:true,case:'hosted exposure boundary includes scoped demo routes, excludes general uploads and simulation'}));
