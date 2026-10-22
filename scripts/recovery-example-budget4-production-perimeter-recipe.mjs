// Pure conditional recipe. No deployment, HTTP client, credential or cloud write.
import {isIP} from 'node:net';
import {v2ProjectWafProtections,v2WafHash,v2WafRuleValue,V2_WAF_PROJECTS,V2_WAF_TEAM} from './prepare-on-demand-production-v3-waf.mjs';
export const V4_PERIMETER=Object.freeze({
  sources:{bazaar:'b6266def82f2962eae943c04a01f28f63f11c66279edb83da71c2709d91b875d',provider:'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2'},
  baselineHashes:{bazaar:'b80bf3ca1bd90fbba00d4bcda9c76478d6664cb7ec9acbf76f219289fb4ac69c',provider:'2b8a3fe761a34fc0216bc7966a3e2755ef264f12d89d88134cbd391ed4c2fdd4'},
  canonicalBazaar:'bazaar.browns.studio',canonicalGuion:'ai-video-scriptwriter.vercel.app',example:'ai-video-scriptwriter-example.vercel.app',
  rules:{bazaar:'rule_bazaar_v2_verified_hosts_only_bazaar_dtwy7E',provider:'rule_bazaar_v2_verified_hosts_only_provider_XPcQJ6'},
});
export const V4_PROVIDER_ROUTES=Object.freeze([
  {method:'GET',path:'/.well-known/stellar-bazaar-provider.txt',authentication:'public-control-record'},
  {method:'GET',path:'/health',authentication:'public-static-liveness'},
  {method:'GET',path:'/v1/bazaar-recovery-example/availability',authentication:'provider-Bearer'},
  {method:'POST',path:'/v1/bazaar-recovery-example',authentication:'provider-Bearer'},
  {method:'POST',path:'/api/bazaar/example/tick',authentication:'worker-Bearer'},
]);
const fail=code=>{throw Error(code);};
const cond=(type,value,neg=false,op='eq')=>({type,op,value,...(neg?{neg:true}:{})});
function exactBaseline(baseline,kind){
 const projection=v2ProjectWafProtections(baseline,kind);
 if(baseline.ownerId!==V2_WAF_TEAM||baseline.projectKey!==V2_WAF_PROJECTS[kind]+'#active'||!projection.firewallEnabled||v2WafHash(projection)!==V4_PERIMETER.baselineHashes[kind])fail('V4_FRESH_BASELINE_DIFF_REQUIRES_REVIEW');
 const rule=baseline.rules.find(r=>r.id===V4_PERIMETER.rules[kind]);
 const old=rule?.conditionGroup?.[0]?.conditions?.[0];
 if(!rule?.active||rule.action?.mitigate?.action!=='deny'||rule.conditionGroup.length!==1||rule.conditionGroup[0].conditions.length!==1||old?.type!=='host'||old.op!=='inc'||old.neg!==true||!Array.isArray(old.value))fail('V4_EXACT_EXISTING_QUARANTINE_REQUIRED');
 return {projection,old};
}
function hostname(value,kind){
 const re=kind==='provider'?/^ai-video-scriptwriter-[a-z0-9]+(?:-cabscryptocontacto-6028s-projects)?\.vercel\.app$/:/^stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/;
 if(!re.test(value??'')||value===V4_PERIMETER.example)fail('V4_NEW_IMMUTABLE_HOST_FROM_VERIFIED_DEPLOYMENT_REQUIRED');
 return value;
}
function exactRoutes(rule,host,routes){
 rule.conditionGroup.push({conditions:[cond('host',host),cond('path',routes.map(r=>r.path),true,'inc')]});
 for(const row of routes)rule.conditionGroup.push({conditions:[cond('host',host),cond('path',row.path),cond('method',row.method,true)]});
}
export function buildV4ProviderPerimeter(baseline,{phase,operatorIp,stagedHostname=null}){
 const {projection,old}=exactBaseline(baseline,'provider');
 if(!['bootstrap-control','handover'].includes(phase)||!isIP(operatorIp??''))fail('V4_EXPLICIT_PHASE_AND_OPERATOR_IP_REQUIRED');
 if(stagedHostname!==null){hostname(stagedHostname,'provider');if(old.value.includes(stagedHostname))fail('V4_NEW_STAGE_MUST_DIFFER_FROM_EXISTING_GUION_HOSTS');}
 if(phase==='handover'&&!stagedHostname)fail('V4_HANDOVER_REQUIRES_CONCRETE_NEW_HOST');
 const expected=structuredClone(baseline),rule=expected.rules.find(r=>r.id===V4_PERIMETER.rules.provider);
 // NOT(old hosts) AND NOT(new alias & production) AND NOT(stage & IP & production).
 const aliasNeg=[cond('host',V4_PERIMETER.example,true),cond('environment','production',true)];
 const stageNeg=stagedHostname?[cond('host',stagedHostname,true),cond('ip_address',operatorIp,true),cond('environment','production',true)]:[];
 rule.conditionGroup=aliasNeg.flatMap(a=>stageNeg.length?stageNeg.map(b=>({conditions:[structuredClone(old),a,b]})):[{conditions:[structuredClone(old),a]}]);
 exactRoutes(rule,V4_PERIMETER.example,phase==='bootstrap-control'?V4_PROVIDER_ROUTES.slice(0,2):V4_PROVIDER_ROUTES);
 if(stagedHostname)exactRoutes(rule,stagedHostname,V4_PROVIDER_ROUTES);
 const next=v2ProjectWafProtections(expected,'provider');
 if(v2WafHash({...projection,rules:projection.rules.filter(r=>r.id!==rule.id)})!==v2WafHash({...next,rules:next.rules.filter(r=>r.id!==rule.id)}))fail('V4_UNRELATED_PROVIDER_PROTECTION_CHANGED');
 return {kind:'provider',phase,expected,body:{action:'rules.update',id:rule.id,value:v2WafRuleValue(rule)},baselineHash:v2WafHash(projection),expectedHash:v2WafHash(next),guionHostsPreserved:[...old.value],deploymentProtectionChanged:false,providerProductionTargetChanged:false,cloudWrites:0};
}
export function buildV4BazaarPerimeter(baseline,{phase,operatorIp,stagedHostname}){
 const {projection,old}=exactBaseline(baseline,'bazaar');
 if(!['staging','handover'].includes(phase)||!isIP(operatorIp??''))fail('V4_EXPLICIT_PHASE_AND_OPERATOR_IP_REQUIRED');
 hostname(stagedHostname,'bazaar');if(old.value.includes(stagedHostname))fail('V4_NEW_BAZAAR_HOST_MUST_DIFFER_FROM_OLD_WRITERS');
 const expected=structuredClone(baseline),rule=expected.rules.find(r=>r.id===V4_PERIMETER.rules.bazaar);
 const retainedHosts=phase==='handover'?[V4_PERIMETER.canonicalBazaar]:[...old.value];
 if(!old.value.includes(V4_PERIMETER.canonicalBazaar))fail('V4_CANONICAL_BAZAAR_REQUIRED');
 // Only the verified new immutable host at the operator IP in production.
 rule.conditionGroup=[cond('host',stagedHostname,true),cond('ip_address',operatorIp,true),cond('environment','production',true)].map(other=>({conditions:[cond('host',retainedHosts,true,'inc'),other]}));
 const next=v2ProjectWafProtections(expected,'bazaar');
 if(v2WafHash({...projection,rules:projection.rules.filter(r=>r.id!==rule.id)})!==v2WafHash({...next,rules:next.rules.filter(r=>r.id!==rule.id)}))fail('V4_PUBLIC_BOUNDARY_OR_UNRELATED_BAZAAR_PROTECTION_CHANGED');
 return {kind:'bazaar',phase,expected,body:{action:'rules.update',id:rule.id,value:v2WafRuleValue(rule)},baselineHash:v2WafHash(projection),expectedHash:v2WafHash(next),retiredImmutableHosts:phase==='handover'?old.value.filter(h=>h!==V4_PERIMETER.canonicalBazaar):[],publicBoundaryRetained:true,cloudWrites:0};
}
