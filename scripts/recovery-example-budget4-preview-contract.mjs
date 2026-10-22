import {createHash} from 'node:crypto';
export const V4_PREVIEW=Object.freeze({
 sourceDigest:'eef893ca18a8cd38697336fcc8d134f371817f344fa00feb226274ad0bee7258',
 productionSourceDigest:'b6266def82f2962eae943c04a01f28f63f11c66279edb83da71c2709d91b875d',
 sourceManifest:'docs/evidence/recovery-example-budget4-bazaar-source-2026-10-13.json',buildReceipt:'docs/evidence/recovery-example-budget4-bazaar-build-2026-10-13.json',
 baseValidationDeployment:'dpl_DudXWxcWKjV6gDdPtHHHkAcBKLHv',oldAliasDeployment:'dpl_CxVLoLaPjY3mHfveVeKjSTa8w9cK',
 oldAliasSourceDigest:'47323858269c8f50b08f6cbd2d49cd6c2dddf75284b2e7f9683b67fb36aa1cf4',
 providerDeployment:'dpl_9jLnhVy8uYkWm74ovapPhb8oGAKm',providerSourceDigest:'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2',
 familyFingerprint:'6d9a73c19837c26df61cc9d11bb3e713da802b7f642a17a76f0f6251ab51a361',operationFingerprint:'260b05680611db188a4498b4c4d539c8d07a6503fce39bebc6d4cb6008ebf7f6',
 oldBudgetVersion:'example-text-wire/v2',newBudgetVersion:'example-text-wire/v3',
 plan:'docs/release/recovery-example-budget4-preview-replacement-plan-2026-10-13.json',intent:'.vercel/recovery-example-budget4-preview-replacement.json',uploadDirectory:'.vercel/recovery-example-budget4-preview-upload-source',
 acceptanceIntent:'.vercel/recovery-example-budget4-preview-acceptance-intent.json',acceptanceReceipt:'docs/evidence/recovery-example-budget4-preview-acceptance-2026-10-13.json',
 maximumNewDeployments:1,maximumNewOrders:0,maximumProviderExecutions:0,maximumHttpRequests:45,maximumResponseBytes:2000000,maximumRealRedisBodyBytes:100000000,maximumRedisCommands:15000,
 restoredWafHashes:Object.freeze({bazaar:'b80bf3ca1bd90fbba00d4bcda9c76478d6664cb7ec9acbf76f219289fb4ac69c',provider:'2b8a3fe761a34fc0216bc7966a3e2755ef264f12d89d88134cbd391ed4c2fdd4'}),
});
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function validateV4ExistingRealm(j,c=V4_PREVIEW){
 if(j?.phase!=='native-ready'||j.budgetVersion!==c.oldBudgetVersion||digest(j.family??'')!==c.familyFingerprint||digest(j.operationId??'')!==c.operationFingerprint||j.acceptance?.order?.phase!=='created'||j.deployments?.bazaar?.deploymentId!==c.baseValidationDeployment||j.deployments?.provider?.deploymentId!==c.providerDeployment||j.deployments.provider.sourceDigest!==c.providerSourceDigest||['budgetWaf','budget3Waf'].some(key=>['bazaar','provider'].some(stage=>j[key]?.[stage]?.phase!=='restored')))throw Error('V4_EXACT_ACCEPTED_V2_REALM_AND_V3_RESTORATION_REQUIRED');
 return true;
}
export function v4PreservedRealmFingerprint(j,c=V4_PREVIEW){validateV4ExistingRealm(j,c);return digest(JSON.stringify({family:j.family,operationId:j.operationId,budgetVersion:j.budgetVersion,acceptance:j.acceptance,deployments:j.deployments,budgetWaf:j.budgetWaf,budget3Waf:j.budget3Waf,cardHash:j.cardHash,buyerOwnerId:j.buyer?.receipt?.ownerId,sellerOwnerId:j.seller?.receipt?.ownerId}));}
export function v4MetadataOverride(base){if(base?.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE!==V4_PREVIEW.oldBudgetVersion||base.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES!==undefined||base.BAZAAR_EXAMPLE_TEXT_TRANSFER_BUDGET_BYTES!==undefined)throw Error('V4_EXISTING_V2_OVERRIDE_WITHOUT_CAP_CHANGE_REQUIRED');return {...base,BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:V4_PREVIEW.newBudgetVersion};}
export function validateV4PreviewRequest(j,raw,init={},expected=V4_PREVIEW){
 validateV4ExistingRealm(j,expected);const u=new URL(raw),method=init.method??'GET',h=new Headers(init.headers);
 if(u.origin!=='https://stellar-bazaar-x402-example-budget2.vercel.app'||u.username||u.password||u.hash||['cookie','origin','host','x-forwarded-host'].some(key=>h.has(key)))throw Error('V4_EXACT_PROTECTED_ALIAS_REQUIRED');
 const roles=new Map(['buyer','seller'].flatMap(r=>[['Bearer '+j[r].agent,r+'-agent'],['Bearer '+j[r].human,r+'-human']])),role=roles.get(h.get('authorization'));
 if(h.has('authorization')&&!role)throw Error('V4_EXISTING_PRIVATE_ROLE_REQUIRED');if(typeof init.body!=='undefined'&&typeof init.body!=='string'||Buffer.byteLength(init.body??'')>32768)throw Error('V4_REQUEST_BOUND');
 if(method==='GET'&&!init.body){
  if(u.pathname==='/api/market/orders/'+j.operationId&&!u.search&&role)return true;
  if(['/api/account/identity','/api/account/queries'].includes(u.pathname)&&!u.search&&role)return true;
  if(u.pathname==='/api/market/catalog'&&u.search==='?q=Comprobante&limit=20'&&!role)return true;
  if(u.pathname==='/resources/'+j.card.id+'/qr.svg'&&!u.search&&!role)return true;
 }
 if(u.pathname==='/api/mcp'&&!u.search&&['buyer-agent','seller-agent'].includes(role)){
  if(method==='GET'&&!init.body)return true;
  if(method==='POST'){
   let b;try{b=JSON.parse(init.body);}catch{throw Error('V4_JSON_RPC_REQUIRED');}
   if(!b||Array.isArray(b)||b.jsonrpc!=='2.0'||Object.keys(b).some(key=>!['jsonrpc','id','method','params'].includes(key)))throw Error('V4_EXACT_JSON_RPC_REQUIRED');
   if(['initialize','notifications/initialized','tools/list'].includes(b.method))return true;
   if(b.method==='tools/call'){
    if(!b.params||Object.keys(b.params).sort().join(',')!=='arguments,name')throw Error('V4_EXACT_TOOL_REQUIRED');const n=b.params.name,a=b.params.arguments;if(!a||typeof a!=='object'||Array.isArray(a))throw Error('V4_EXACT_ARGUMENTS_REQUIRED');
    if(['get_bazaar_identity','get_bazaar_capabilities','get_bazaar_skills','list_market_services','list_market_orders','get_bazaar_query_history'].includes(n)&&Object.keys(a).length===0)return true;
    if(n==='get_market_order'&&JSON.stringify(a)===JSON.stringify({operationId:j.operationId}))return true;
    if(n==='get_service'&&JSON.stringify(a)===JSON.stringify({id:j.card.id}))return true;
   }
  }
 }
 throw Error('V4_READ_ONLY_SAME_ORDER_ACCEPTANCE_ONLY');
}
