import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pilotRoutePolicy} from '../lib/pilot-route-policy.ts';
const p=JSON.parse(readFileSync('docs/TEXT_DEMO_PUBLIC_WAF_PROPOSAL.json','utf8'));
Object.assign(process.env,{BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_PUBLIC_DEMO:'true'});
assert.equal(p.approved,false);assert.equal(p.remoteApplied,false);assert.equal(p.requestTemplate.body.action,'rules.update');assert.equal(p.requestTemplate.body.id,p.sourceRuleId);
assert.equal(p.requestTemplate.body.value.action.mitigate.action,'deny');assert.equal(p.requestTemplate.body.value.conditionGroup.length,12);
const local='PRIVATE_LOCAL_IP',other='SYNTHETIC_EXTERNAL_IP';
function matches(groups,r){return groups.some(g=>g.conditions.every(c=>{
 const value=String(r[c.type]??'');let match;
 if(c.op==='eq')match=value.toLowerCase()===String(c.value).toLowerCase();
 else if(c.op==='inc')match=c.value.some(v=>String(v).toLowerCase()===value.toLowerCase());
 else if(c.op==='re')match=new RegExp(c.value,'i').test(value);
 else throw Error('Unsupported proposal operator');
 return c.neg?!match:match;
}));}
const production=(path,method='GET')=>({host:'bazaar.browns.studio',environment:'production',method,path,ip_address:other});
const uuid='00000000-0000-4000-8000-000000000001';
const allowed=[
 ...['/','/demo','/open','/hub','/catalogo','/publish','/history','/storage','/demo-qr.svg','/bazaar-qr.svg','/favicon.ico','/DEMO_TESTNET.md','/AGENT_CONNECTION.md','/BUYER.md','/SELLER_AGENT_KIT.md','/WORKSPACE_AGENT.md','/skills/buyer/SKILL.md','/resources/guionista-text','/_next/static/chunks/demo.js'].flatMap(path=>[['GET',path],['HEAD',path]]),
 ...['/api/mcp','/api/market/catalog','/api/account/identity','/api/account/queries','/api/operations','/api/market/orders','/api/market/services','/api/market/agent-permissions',`/api/market/orders/${uuid}`,`/api/market/orders/${uuid}/deliveries`].map(path=>['GET',path]),
 ...['/api/mcp','/api/workspaces',`/api/workspaces/${uuid}/access`,'/api/account/wallet/challenge','/api/account/wallet/complete','/api/market/capacity','/api/market/orders','/api/market/services','/api/market/agent-permissions',`/api/market/orders/${uuid}`,`/api/market/services/${uuid}`,`/api/market/orders/${uuid}/x402`,`/api/market/orders/${uuid}/deliveries`,`/api/market/orders/${uuid}/deliveries/confirm`].map(path=>['POST',path])
];
let permissionChecks=0;
for(const[method,path]of allowed){const r=production(path,method);assert(matches(p.exceptionPredicate.conditionGroup,r),method+' '+path);assert(!matches(p.requestTemplate.body.value.conditionGroup,r));assert.notEqual(pilotRoutePolicy(path,method),'deny');permissionChecks++;}
const forbidden=['/admin','/admin/operations','/api/admin/magic-link','/api/market/review','/api/market/control','/api/market/guardian','/api/market/guardian/tick','/api/market/operations-budget','/market-operations','/api/x402/demo-pay','/api/buyer-execution/reference','/api/deliveries/uploads','/cover.jpg','/demo-deliveries/video.mp4','/images/unapproved.jpg','/api/discovery/resources',`/api/market/orders/${uuid}/x402/extra`,'/api/market/orders/not-a-uuid/x402','/api/workspaces/invalid/access','/api/market/capacity/extra'];
for(const path of forbidden)for(const method of ['GET','HEAD','POST','PUT','DELETE','OPTIONS']){const r=production(path,method);assert(!matches(p.exceptionPredicate.conditionGroup,r));assert(matches(p.requestTemplate.body.value.conditionGroup,r));permissionChecks++;}
for(const[method,path]of[['POST','/demo'],['POST','/demo-qr.svg'],['HEAD','/api/mcp'],['GET','/api/market/capacity'],['PUT','/api/market/orders'],['DELETE','/api/mcp'],['OPTIONS','/api/mcp']]){assert(matches(p.requestTemplate.body.value.conditionGroup,production(path,method)));permissionChecks++;}
// Independent truth table proves originalDeny && !exactException. Native private-IP
// acceptance and preview MCP scope retain exactly their former predicate.
const hosts=['bazaar.browns.studio','other.invalid',...p.sourceRuleSanitized.conditionGroup[0].conditions[1].value];
const paths=['/demo','/api/mcp','/_next/static/chunks/demo.js','/api/market/capacity','/admin','/api/market/control',`/api/market/orders/${uuid}/x402`,'/api/market/orders/invalid/x402'];
let truthTableCases=0;
for(const host of hosts)for(const environment of ['production','preview'])for(const method of ['GET','HEAD','POST','PUT','DELETE','OPTIONS'])for(const path of paths)for(const ip_address of [local,other]){
 const r={host,environment,method,path,ip_address};
 const expected=matches(p.sourceRuleSanitized.conditionGroup,r)&&!matches(p.exceptionPredicate.conditionGroup,r);
 assert.equal(matches(p.requestTemplate.body.value.conditionGroup,r),expected,JSON.stringify({host,environment,method,path,privateIp:ip_address===local}));truthTableCases++;
}
for(const host of hosts.slice(2)){assert(!matches(p.requestTemplate.body.value.conditionGroup,{host,environment:'preview',method:'POST',path:'/api/mcp',ip_address:other}));assert(matches(p.requestTemplate.body.value.conditionGroup,{host,environment:'preview',method:'GET',path:'/demo',ip_address:other}));}
assert.equal(p.placeholder.includes('read the current configuration'),true);
console.log(JSON.stringify({status:'PASS',permissionChecks,truthTableCases,existingRulePredicatePreserved:true,operatorRoutesClosedToExternalClients:true,remoteApplied:false,limitations:['Offline predicate/schema review; API acceptance, config read-back and public access require authorization and hosted checks']}));
