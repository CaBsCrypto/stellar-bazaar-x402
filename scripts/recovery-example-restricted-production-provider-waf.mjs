// Pure plan; the parent must freshly read, review and apply the exact draft separately.
// The existing Guion alias and all prior hosts/rules remain semantically unchanged.
import {isIP} from 'node:net';
import {RESTRICTED_EXAMPLE_PRODUCTION as P,sha} from './recovery-example-restricted-production-package.mjs';
import {sellerCanonical} from '../examples/seller-service-card.mjs';
import {v2ProjectWafProtections,v2WafRuleValue} from './prepare-on-demand-production-v3-waf.mjs';
import {matchesWafGroups} from './prepare-continuous-production-waf-proposal.mjs';
const fail=code=>{throw Error(code);};
const fingerprint=value=>sha(sellerCanonical(value));
const ruleId='rule_bazaar_v2_verified_hosts_only_provider_XPcQJ6';
const denied=(c,r)=>c.rules.some(rule=>rule.active&&rule.action?.mitigate?.action==='deny'&&matchesWafGroups(rule.conditionGroup,r));
const paths=Object.freeze([
  {path:'/.well-known/stellar-bazaar-provider.txt',method:'GET'},
  {path:'/v1/bazaar-recovery-example/availability',method:'GET'},
  {path:'/v1/bazaar-recovery-example',method:'POST'},
  {path:'/api/bazaar/example/tick',method:'POST'},
]);
export function restrictedExampleProviderWafPlan(baseline,{operatorIp,stagedHostname}){
  const projection=v2ProjectWafProtections(baseline,'provider');
  if(baseline.ownerId!==P.teamId||baseline.projectKey!==P.providerProject+'#active'||projection.firewallEnabled!==true||!isIP(operatorIp??'')||
    !/^ai-video-scriptwriter-[a-z0-9]+(?:-cabscryptocontacto-6028s-projects)?\.vercel\.app$/.test(stagedHostname??''))fail('EXAMPLE_FRESH_OWNED_PROVIDER_WAF_AND_PRIVATE_STAGE_REQUIRED');
  const expected=structuredClone(baseline),quarantine=expected.rules.find(rule=>rule.id===ruleId),host=new URL(P.exampleOrigin).hostname;
  if(!quarantine||!quarantine.active||quarantine.action?.mitigate?.action!=='deny'||quarantine.conditionGroup.length!==1)fail('EXAMPLE_RESTORED_SINGLE_GROUP_PROVIDER_QUARANTINE_REQUIRED');
  const [group]=quarantine.conditionGroup;
  if(group.conditions?.length!==1)fail('EXAMPLE_EXACT_OLD_PROVIDER_HOST_CONDITION_REQUIRED');
  const old=group.conditions[0];
  if(old.type!=='host'||old.op!=='inc'||old.neg!==true||!Array.isArray(old.value)||!old.value.includes(new URL(P.guionOrigin).hostname)||old.value.includes(host)||old.value.includes(stagedHostname))fail('EXAMPLE_DISTINCT_NEW_PROVIDER_HOSTS_REQUIRED');
  // Deny NOT(old) AND NOT(new canonical & Production) AND NOT(stage & operator & Production).
  const notCanonical=[{type:'host',op:'eq',value:host,neg:true},{type:'environment',op:'eq',value:'production',neg:true}];
  const notStage=[{type:'host',op:'eq',value:stagedHostname,neg:true},{type:'ip_address',op:'eq',value:operatorIp,neg:true},{type:'environment',op:'eq',value:'production',neg:true}];
  quarantine.conditionGroup=notCanonical.flatMap(a=>notStage.map(b=>({conditions:[structuredClone(old),a,b]})));
  // The new public alias permits only exact methods and the four fixed V5 paths.
  quarantine.conditionGroup.push({conditions:[{type:'host',op:'eq',value:host},{type:'path',op:'inc',value:paths.map(p=>p.path),neg:true}]});
  for(const allowed of paths)quarantine.conditionGroup.push({conditions:[{type:'host',op:'eq',value:host},{type:'path',op:'eq',value:allowed.path},{type:'method',op:'eq',value:allowed.method,neg:true}]});
  if(quarantine.conditionGroup.length>25)fail('EXAMPLE_PROVIDER_WAF_CONDITION_CAPACITY_REQUIRED');
  const priorOther={...projection,rules:projection.rules.filter(rule=>rule.id!==ruleId)},nextProjection=v2ProjectWafProtections(expected,'provider');
  if(fingerprint(priorOther)!==fingerprint({...nextProjection,rules:nextProjection.rules.filter(rule=>rule.id!==ruleId)}))fail('EXAMPLE_OTHER_PROVIDER_PROTECTIONS_CHANGED');
  const methods=['GET','HEAD','POST','PUT','DELETE','OPTIONS'],testPaths=['/',...paths.map(x=>x.path),'/api/bazaar/seller/tick','/v1/marketplace-text','/unlisted'],environments=['production','preview','development'];
  const otherIp=operatorIp==='192.0.2.2'?'192.0.2.3':'192.0.2.2';let oldCases=0,newCases=0;
  for(const oldHost of [...old.value,'unknown-provider.vercel.app'])for(const environment of environments)for(const method of methods)for(const path of testPaths)for(const ip_address of [operatorIp,otherIp]){
    const request={host:oldHost,environment,method,path,ip_address};if(denied(baseline,request)!==denied(expected,request))fail('EXAMPLE_EXISTING_PROVIDER_HOST_POLICY_CHANGED');oldCases++;
  }
  for(const hostname of [host,stagedHostname])for(const environment of environments)for(const method of methods)for(const path of testPaths)for(const ip_address of [operatorIp,otherIp]){
    const request={host:hostname,environment,method,path,ip_address};
    const allowed=environment==='production'&&(hostname===stagedHostname?ip_address===operatorIp:paths.some(row=>row.path===path&&row.method===method));
    if(denied(expected,request)===allowed)fail('EXAMPLE_PRODUCTION_PROVIDER_FIXED_ROUTES_UNCONFIRMED');newCases++;
  }
  return {status:'PURE_RESTRICTED_EXAMPLE_PROVIDER_WAF_PLAN_NOT_APPLIED',projectId:P.providerProject,host,stagedHostname,ruleId,
    baselineHash:fingerprint(projection),expectedHash:fingerprint(nextProjection),expected,edits:[quarantine],body:{action:'rules.update',id:ruleId,value:v2WafRuleValue(quarantine)},
    conditionGroups:quarantine.conditionGroup.length,oldCases,newCases,priorGuionPolicyPreserved:true,otherRulesAndProtectionsPreserved:true,publicPaths:paths,
    operatorIpInPublicOutput:false,deploymentProtectionChanged:false,ssoproofStillRequired:true,productionPublished:false,cloudWrites:0};
}
