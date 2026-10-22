import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildV4ProviderPerimeter,buildV4BazaarPerimeter,V4_PERIMETER,V4_PROVIDER_ROUTES} from './recovery-example-budget4-production-perimeter-recipe.mjs';
import {matchesWafGroups} from './prepare-continuous-production-waf-proposal.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const path='scripts/recovery-example-budget4-production-perimeter-recipe.mjs';
const snapshots=Object.fromEntries(await Promise.all(['bazaar','provider'].map(async kind=>[kind,JSON.parse(await readFile(`.vercel/recovery-example-budget4-preview-${kind}-waf-baseline.json`))])));
const b=snapshots.bazaar.bazaarWaf,p=snapshots.provider.providerWaf;
const before={bazaar:sha(JSON.stringify(b)),provider:sha(JSON.stringify(p))};
const input={operatorIp:'192.0.2.123',stagedHostname:'ai-video-scriptwriter-localtestv4.vercel.app'};
const pp=buildV4ProviderPerimeter(p,{...input,phase:'bootstrap-control'}),ph=buildV4ProviderPerimeter(p,{...input,phase:'handover'});
const bi={operatorIp:input.operatorIp,stagedHostname:'stellar-bazaar-x402-localtestv4-cabscryptocontacto-6028s-projects.vercel.app'};
const bs=buildV4BazaarPerimeter(b,{...bi,phase:'staging'}),bh=buildV4BazaarPerimeter(b,{...bi,phase:'handover'});
const denied=(c,r)=>c.rules.some(rule=>rule.active&&rule.action?.mitigate?.action==='deny'&&matchesWafGroups(rule.conditionGroup,r));
const req=(host,path,method='GET',environment='production',ip_address='192.0.2.200')=>({host,path,method,environment,ip_address});
let checks=0,matrixCases=0;const check=fn=>{fn();checks++;};
for(const kind of ['bazaar','provider']){
 const receipt=JSON.parse(await readFile(`docs/evidence/recovery-example-budget4-${kind}-preview-waf-restore-2026-10-13.json`));
 check(()=>assert.equal(receipt.status,'PASS_ORIGINAL_FIREWALL_RESTORED'));
 check(()=>assert.equal(receipt.protectionHash,V4_PERIMETER.baselineHashes[kind]));
}
const testPaths=['/','/health','/.well-known/stellar-bazaar-provider.txt','/v1/bazaar-recovery-example/availability','/v1/bazaar-recovery-example','/api/bazaar/example/tick','/api/bazaar/example/health','/unknown'];
for(const host of [...ph.guionHostsPreserved,'unknown-provider.vercel.app'])for(const method of ['GET','HEAD','POST','PUT'])for(const path of testPaths)for(const environment of ['production','preview']){
 const r=req(host,path,method,environment);assert.equal(denied(pp.expected,r),denied(p,r));assert.equal(denied(ph.expected,r),denied(p,r));matrixCases++;
}
checks++;
for(const phase of [pp,ph])for(const host of [V4_PERIMETER.example,input.stagedHostname])for(const method of ['GET','HEAD','POST','PUT'])for(const path of testPaths)for(const environment of ['production','preview'])for(const ip of [input.operatorIp,'192.0.2.200']){
 const rows=host===input.stagedHostname||phase===ph?V4_PROVIDER_ROUTES:V4_PROVIDER_ROUTES.slice(0,2);
 const allowed=environment==='production'&&(host===V4_PERIMETER.example||ip===input.operatorIp)&&rows.some(r=>r.path===path&&r.method===method);
 assert.equal(denied(phase.expected,req(host,path,method,environment,ip)),!allowed);matrixCases++;
}
checks++;
check(()=>assert.deepEqual(ph.guionHostsPreserved,p.rules[0].conditionGroup[0].conditions[0].value));
check(()=>assert.equal(ph.providerProductionTargetChanged,false));
check(()=>assert.deepEqual(bh.expected.rules[0],b.rules[0]));
const bazaarPaths=['/','/catalogo','/api/mcp','/api/market/orders','/api/market/guardian/tick','/unknown'];
for(const path of bazaarPaths)for(const method of ['GET','HEAD','POST','DELETE'])for(const environment of ['production','preview'])for(const ip of [input.operatorIp,'192.0.2.200']){
 const r=req(V4_PERIMETER.canonicalBazaar,path,method,environment,ip);assert.equal(denied(bs.expected,r),denied(b,r));assert.equal(denied(bh.expected,r),denied(b,r));matrixCases++;
}
checks++;
for(const host of bh.retiredImmutableHosts)for(const ip of [input.operatorIp,'192.0.2.200'])check(()=>assert.equal(denied(bh.expected,req(host,'/api/mcp','POST','production',ip)),true));
for(const r of [req(bi.stagedHostname,'/api/mcp','POST','production','192.0.2.200'),req(bi.stagedHostname,'/api/mcp','POST','preview',input.operatorIp)])check(()=>assert.equal(denied(bs.expected,r),true));
for(const host of ['stellar-bazaar-x402-example-budget2.vercel.app','ai-video-scriptwriter-example-budget2.vercel.app'])check(()=>assert.equal(denied(host.startsWith('stellar')?bh.expected:ph.expected,req(host,'/api/mcp','POST')),true));
check(()=>assert.deepEqual(before,{bazaar:sha(JSON.stringify(b)),provider:sha(JSON.stringify(p))}));
check(()=>assert.equal(buildV4ProviderPerimeter(p,{phase:'bootstrap-control',operatorIp:input.operatorIp}).cloudWrites,0));
check(()=>assert.throws(()=>buildV4ProviderPerimeter(p,{phase:'handover',operatorIp:input.operatorIp})));
check(()=>assert.throws(()=>buildV4ProviderPerimeter(p,{...input,phase:'handover',operatorIp:'*'})));
check(()=>assert.throws(()=>buildV4ProviderPerimeter(p,{...input,phase:'handover',stagedHostname:V4_PERIMETER.example})));
check(()=>assert.throws(()=>buildV4BazaarPerimeter({...b,firewallEnabled:false},{...bi,phase:'staging'})));
check(()=>assert.throws(()=>buildV4ProviderPerimeter({...p,ips:[{action:'allow',value:'*'}]},{...input,phase:'bootstrap-control'})));
const server=await readFile('.vercel/recovery-example-provider-v5-source/server.ts','utf8');
check(()=>{for(const route of V4_PROVIDER_ROUTES)assert(server.includes(`'${route.path}'`));assert(!server.includes("'/api/bazaar/example/health'"));});
const evidence={version:1,status:'PASS_LOCAL_CONDITIONAL_V4_PERIMETER_RECIPE',checks,matrixCases,sourceSha256:sha(await readFile(path)),sourceBindings:V4_PERIMETER.sources,baselineHashes:V4_PERIMETER.baselineHashes,providerExactRoutes:V4_PROVIDER_ROUTES,productionRebasePerformed:false,productionPublished:false,networkRequests:0,cloudWrites:0,dpapiReads:0,secretValuesReturned:0,payments:0,cronActivated:false,limitsChanged:false,scope:'Pure predicate matching only. SSO/access and fresh target readback remain required; no staged deployment IDs or real operator IP are fabricated.'};
const evidencePath='docs/evidence/recovery-example-budget4-production-perimeter-recipe-local-2026-10-13.json';
await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...evidence,evidencePath}));
