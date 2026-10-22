import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFreePreviewWafRule, freePreviewWafProposal, FREE_PREVIEW_HOST, FREE_PREVIEW_EXCEPTION } from './prepare-free-demo-preview-waf.mjs';
import { matchesWafGroups } from './prepare-continuous-production-waf-proposal.mjs';
const snapshot=JSON.parse(await readFile('docs/evidence/continuous-waf-baseline-2026-10-11.json','utf8')), receipt=JSON.parse(await readFile('docs/evidence/free-demo-bazaar-preview-deployment-2026-10-11.json','utf8'));
const before=structuredClone(snapshot.sourceRule), after=buildFreePreviewWafRule(before);let cases=0,exceptions=0;
assert.equal(after.conditionGroup.length,18); assert.deepEqual(before,snapshot.sourceRule);
for(const ip_address of ['PRIVATE_LOCAL_IP','FOREIGN_IP']) for(const environment of ['preview','production','development','other']) for(const host of [FREE_PREVIEW_HOST, 'bazaar.browns.studio','foreign.vercel.app','stellar-bazaar-x402-gwbzxq0qm-cabscryptocontacto-6028s-projects.vercel.app.evil','stellar-bazaar-x402-memk9avsw-cabscryptocontacto-6028s-projects.vercel.app',...before.conditionGroup[0].conditions.find(c=>c.type==='host'&&c.op==='inc').value]) for(const method of ['GET','POST','HEAD','OPTIONS','DELETE','PUT','PATCH']) for(const path of ['/api/mcp','/api/mcp/','/API/MCP','/api/mcp-other','/api/market/catalog','/api/account/identity','/api/workspaces','/api/market/orders','/api/market/guardian/tick','/market-review','/api/market/control','/resources/example','/','/catalogo','/downloads/bazaar-native-text-provider-kit.tgz']) {
  const request={ip_address,environment,host,method,path}, old=matchesWafGroups(before.conditionGroup,request), exception=matchesWafGroups([FREE_PREVIEW_EXCEPTION],request), next=matchesWafGroups(after.conditionGroup,request);
  assert.equal(next,old&&!exception);cases++;if(old&&!next)exceptions++;
}
const proposal=freePreviewWafProposal(snapshot,receipt);assert.equal(proposal.productionChanged,false);
for(const [s,r] of [[{...snapshot,configurationSha256:'f'.repeat(64)},receipt],[snapshot,{...receipt,target:'production'}],[snapshot,{...receipt,sourceDigest:'f'.repeat(64)}],[snapshot,{...receipt,url:'https://foreign.vercel.app'}]]) assert.throws(()=>freePreviewWafProposal(s,r));
console.log(JSON.stringify({status:'PASS',cases,newlyExcludedCases:exceptions,groups:18,productionBehaviorPreserved:true,operatorIpsPrinted:false,networkRequests:0,cloudWrites:0,payments:0}));
