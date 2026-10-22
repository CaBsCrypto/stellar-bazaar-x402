import {createHash} from 'node:crypto';

export const V3_PREVIEW = Object.freeze({
 sourceDigest:'47323858269c8f50b08f6cbd2d49cd6c2dddf75284b2e7f9683b67fb36aa1cf4',
 productionSourceDigest:'255443a679645418603f7b46a7aab82436a8014e55445f9b7d244e20dbbcfa08',
 sourceManifest:'docs/evidence/recovery-example-budget3-bazaar-source-2026-10-13.json',
 buildReceipt:'docs/evidence/recovery-example-budget3-bazaar-build-2026-10-13.json',
 oldDeployment:'dpl_DudXWxcWKjV6gDdPtHHHkAcBKLHv',
 providerDeployment:'dpl_9jLnhVy8uYkWm74ovapPhb8oGAKm',
 providerSourceDigest:'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2',
 familyFingerprint:'6d9a73c19837c26df61cc9d11bb3e713da802b7f642a17a76f0f6251ab51a361',
 operationFingerprint:'260b05680611db188a4498b4c4d539c8d07a6503fce39bebc6d4cb6008ebf7f6',
 oldBudgetVersion:'example-text-wire/v2',newBudgetVersion:'example-text-wire/v3',
 intent:'.vercel/recovery-example-budget3-preview-replacement.json',
 uploadDirectory:'.vercel/recovery-example-budget3-preview-upload-source',
 maximumNewDeployments:1,maximumNewOrders:0,maximumProviderExecutions:0,
 maximumHttpRequests:45,maximumResponseBytes:2000000,
 maximumRealRedisBodyBytes:100000000,maximumRedisCommands:15000,
});
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateV3ExistingRealm(j,c=V3_PREVIEW){
 if(j?.phase!=='native-ready'||j.budgetVersion!==c.oldBudgetVersion||digest(j.family??'')!==c.familyFingerprint||digest(j.operationId??'')!==c.operationFingerprint||j.acceptance?.order?.phase!=='created'||j.deployments?.bazaar?.deploymentId!==c.oldDeployment||j.deployments?.provider?.deploymentId!==c.providerDeployment||j.deployments.provider.sourceDigest!==c.providerSourceDigest||j.budgetWaf?.bazaar?.phase!=='restored'||j.budgetWaf?.provider?.phase!=='restored')throw Error('V3_EXACT_ACCEPTED_V2_REALM_REQUIRED');
 return true;
}
export function v3MetadataOverride(base){
 if(base?.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE!==V3_PREVIEW.oldBudgetVersion)throw Error('V3_EXISTING_V2_OVERRIDE_REQUIRED');
 return {...base,BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:V3_PREVIEW.newBudgetVersion};
}
export function validateV3PreviewRequest(j,raw,init={},expected=V3_PREVIEW){
 validateV3ExistingRealm(j,expected);
 const u=new URL(raw),method=init.method??'GET',h=new Headers(init.headers);
 if(u.origin!=='https://stellar-bazaar-x402-example-budget2.vercel.app'||u.username||u.password||u.hash||h.has('cookie')||h.has('origin'))throw Error('V3_EXACT_PROTECTED_ALIAS_REQUIRED');
 const roles=new Map(['buyer','seller'].flatMap(r=>[['Bearer '+j[r].agent,r+'-agent'],['Bearer '+j[r].human,r+'-human']])),role=roles.get(h.get('authorization'));
 if(Buffer.byteLength(init.body??'')>32768)throw Error('V3_REQUEST_BOUND');
 if(method==='GET'&&!init.body){
  if(u.pathname==='/api/market/orders/'+j.operationId&&!u.search&&role)return true;
  if(['/api/account/identity','/api/account/queries'].includes(u.pathname)&&!u.search&&role)return true;
  if(u.pathname==='/api/market/catalog'&&u.search==='?q=Comprobante&limit=20'&&!role)return true;
  if(u.pathname==='/resources/'+j.card.id+'/qr.svg'&&!u.search&&!role)return true;
 }
 if(u.pathname==='/api/mcp'&&!u.search&&['buyer-agent','seller-agent'].includes(role)){
  if(method==='GET'&&!init.body)return true;
  if(method==='POST'){
   let b;try{b=JSON.parse(init.body);}catch{throw Error('V3_JSON_RPC_REQUIRED');}
   if(['initialize','notifications/initialized','tools/list'].includes(b.method))return true;
   if(b.method==='tools/call'){
    const n=b.params?.name,a=b.params?.arguments;
    if(!a||typeof a!=='object'||Array.isArray(a))throw Error('V3_EXACT_ARGUMENTS_REQUIRED');
    if(['get_bazaar_identity','get_bazaar_capabilities','get_bazaar_skills','list_market_services','list_market_orders','get_bazaar_query_history'].includes(n))return true;
    if(n==='get_market_order'&&JSON.stringify(a)===JSON.stringify({operationId:j.operationId}))return true;
    if(n==='get_service'&&JSON.stringify(a)===JSON.stringify({id:j.card.id}))return true;
   }
  }
 }
 throw Error('V3_READ_ONLY_SAME_ORDER_ACCEPTANCE_ONLY');
}
