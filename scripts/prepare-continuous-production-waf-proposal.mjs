// Public preparation and pure predicate transformation. No API or cloud writes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const baselineConfigurationSha256='d15c59f7aff6bcde4eaf37e5a3755df1c631f99b5c8be09227e862939f3d57bd';
export const sourceRuleId='rule_bazaar_acceptance_egress_only_iPEa7V';
const canonicalHost='bazaar.browns.studio',guardianPath='/api/market/guardian/tick';
const publicDocuments=['/examples/native-text-service-card.json','/BUYER_AGENT_KIT.md','/downloads/bazaar-native-text-provider-kit.tgz','/downloads/bazaar-native-text-provider-kit.manifest.json'];
const fail=code=>{throw Error(code);};
const clone=value=>structuredClone(value);
const condition=(type,op,value,neg=false)=>({type,op,value,...(neg?{neg:true}:{})});
const matchCondition=(c,value)=>{
 let matches;if(c.op==='eq')matches=String(value).toLowerCase()===String(c.value).toLowerCase();
 else if(c.op==='inc')matches=c.value.some(v=>String(v).toLowerCase()===String(value).toLowerCase());
 else if(c.op==='re')matches=new RegExp(c.value,'i').test(String(value));
 else fail('WAF_CONDITION_OPERATOR_UNSUPPORTED');
 return c.neg?!matches:matches;
};
export const matchesWafGroups=(groups,request)=>groups.some(group=>group.conditions.every(c=>matchCondition(c,request[c.type]??'')));
function validateSourceRule(sourceRule,configurationSha256){
 if(configurationSha256!==baselineConfigurationSha256||sourceRule?.id!==sourceRuleId||sourceRule.active!==true||sourceRule.action?.mitigate?.action!=='deny'||sourceRule.conditionGroup?.length!==12)fail('REVIEWED_WAF_BASELINE_REQUIRED');
 for(const group of sourceRule.conditionGroup){
  if(!Array.isArray(group.conditions)||!group.conditions.length)fail('WAF_CONDITION_SCHEMA_UNSUPPORTED');
  for(const c of group.conditions){if(!['ip_address','host','environment','method','path'].includes(c.type)||!['eq','inc','re'].includes(c.op)||c.neg!==undefined&&typeof c.neg!=='boolean'||c.op==='inc'&&(!Array.isArray(c.value)||!c.value.length||c.value.some(v=>typeof v!=='string'))||c.op!=='inc'&&typeof c.value!=='string')fail('WAF_CONDITION_SCHEMA_UNSUPPORTED');if(c.op==='re')new RegExp(c.value,'i');}
 }
}
function guardianCanOverlap(conditions,hosts){
 return hosts.some(host=>conditions.filter(c=>['host','environment','method','path'].includes(c.type)).every(c=>matchCondition(c,{host,environment:'production',method:'GET',path:guardianPath}[c.type])));
}
function provenImpossible(conditions){
 // Only finite positive equality/inclusion constraints permit this reduction.
 // Regex or negative constraints alone are never guessed to be impossible.
 for(const type of ['host','environment','method','path','ip_address']){
  const same=conditions.filter(c=>c.type===type),finite=same.find(c=>!c.neg&&['eq','inc'].includes(c.op));
  if(finite){const candidates=finite.op==='eq'?[finite.value]:finite.value;if(!candidates.some(value=>same.every(c=>matchCondition(c,value))))return true;}
 }
 return false;
}
/** The release owner supplies an exact READY production deployment hostname and
 * a fresh actual rule/hash. This function never reads or modifies Vercel. */
export function buildContinuousProductionWafRule({sourceRule,configurationSha256,finalDeploymentHostname}){
 validateSourceRule(sourceRule,configurationSha256);
 if(typeof finalDeploymentHostname!=='string'||!/^stellar-bazaar-x402-[a-z0-9]{5,40}-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(finalDeploymentHostname))fail('EXACT_READY_PRODUCTION_HOSTNAME_REQUIRED');
 const hosts=[canonicalHost,finalDeploymentHostname];
 const notGuardian=[condition('environment','eq','production',true),condition('host','inc',hosts,true),condition('method','eq','GET',true),condition('path','eq',guardianPath,true)];
 let documentPatterns=0;const groups=[];
 for(const original of sourceRule.conditionGroup){
  const group=clone(original);
  const fixedMethod=group.conditions.find(c=>c.type==='method'&&c.op==='eq'&&!c.neg&&['GET','HEAD'].includes(c.value));
  if(fixedMethod){
   const paths=group.conditions.filter(c=>c.type==='path'&&c.op==='re'&&c.neg);
   if(paths.length!==1)fail('REVIEWED_DOCUMENT_PATH_PATTERN_REQUIRED');
   // The baseline's other host/environment deny groups still constrain these
   // exact documents to the canonical production host. Preserve the old regex.
   const exactPaths=publicDocuments.map(path=>'^'+path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
   paths[0].value='(?:'+[paths[0].value,...exactPaths].join('|')+')';documentPatterns++;
  }
  if(!guardianCanOverlap(group.conditions,hosts)){groups.push(group);continue;}
  for(const denial of notGuardian){const conditions=[...group.conditions,denial];if(!provenImpossible(conditions))groups.push({...group,conditions});}
 }
 if(documentPatterns!==4)fail('REVIEWED_DOCUMENT_PATH_PATTERNS_CHANGED');
 const proposed={...clone(sourceRule),conditionGroup:groups};
 const exactExceptions=[
  {conditions:[condition('environment','eq','production'),condition('host','inc',hosts),condition('method','eq','GET'),condition('path','eq',guardianPath)]},
  {conditions:[condition('environment','eq','production'),condition('host','eq',canonicalHost),condition('method','inc',['GET','HEAD']),condition('path','inc',publicDocuments)]},
 ];
 return {rule:proposed,exactExceptions,sourceRuleId,conditionGroups:groups.length,remoteApplied:false,productionHostname:finalDeploymentHostname};
}
export function continuousProductionWafReview(snapshot){
 const sourceRule=snapshot?.sourceRule??snapshot?.firewall?.rules?.find(rule=>rule.id===sourceRuleId);
 validateSourceRule(sourceRule,snapshot?.configurationSha256??snapshot?.firewallConfigurationSha256);
 if(snapshot.status!=='READ_ONLY_CURRENT_WAF_BASELINE')fail('REVIEWED_WAF_BASELINE_REQUIRED');
 return {
  version:1,status:'PREPARED_NOT_APPLIED',approved:false,remoteApplied:false,
  projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',sourceRuleId,
  baselineEvidence:'docs/evidence/continuous-waf-baseline-2026-10-11.json',baselineConfigurationSha256,
  transformModule:'scripts/prepare-continuous-production-waf-proposal.mjs',transformExport:'buildContinuousProductionWafRule',
  readyProductionDeploymentHostname:null,readyProductionDeploymentId:null,
  actualRequestBody:null,applyBlockedUntil:['reviewed final source and configuration digests','explicit production/scheduler authorization','exact READY immutable production hostname bound to final deployment ID','fresh actual WAF baseline hash equals reviewed baseline','actual operator IP retained internally; sanitized placeholder cannot be applied','Vercel predicate validation and current condition-group limit checked before mutation'],
  publicAdditions:[
   {path:guardianPath,methods:['GET'],environment:'production',hosts:[canonicalHost],additionalExactHostReference:'FINAL_READY_PRODUCTION_DEPLOYMENT_HOSTNAME_REQUIRED',authentication:'existing operator credential and CRON_SECRET hash proof; no browser Origin, query or request body',requiresProxyStaticProof:true},
   ...publicDocuments.map(path=>({path,methods:['GET','HEAD'],environment:'production',hosts:[canonicalHost]})),
  ],
  preserved:{existingRuleId:true,denyAction:true,ruleActive:true,privateOperatorIp:true,existingPreviewMcpConditions:true,unrelatedRulesAndCrs:true,existingPublicRoutes:true},
  privatePaths:['/market-review','/api/market/review','/api/market/control','/market-operations','/api/market/guardian','/api/market/operations-budget'],
  forbiddenBroadening:['wildcard hosts','all /api paths','operator review/control routes','browser-origin guardian cron','HEAD or POST guardian cron','preview guardian cron'],
  predicate:'proposedDeny = baselineDeny AND NOT (exactGuardianProductionException OR exactCanonicalPublicDocumentsException)',
  productionPublicationPerformed:false,cronActivated:false,payments:0,
 };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  if(process.argv.length!==2)fail('WAF_REVIEW_ARGUMENTS_FORBIDDEN');
  const root=fileURLToPath(new URL('..',import.meta.url)),snapshot=JSON.parse(await readFile(resolve(root,'docs/evidence/continuous-waf-baseline-2026-10-11.json'),'utf8'));
  const proposal=continuousProductionWafReview(snapshot),output=resolve(root,'docs/release/continuous-production-waf-proposal-2026-10-11.json');
  const bytes=JSON.stringify(proposal,null,2)+'\n';await writeFile(output,bytes,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:proposal.status,output:'docs/release/continuous-production-waf-proposal-2026-10-11.json',sha256:createHash('sha256').update(bytes).digest('hex'),remoteApplied:false}));
 }catch(error){console.error(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]{1,95}$/.test(error?.message??'')?error.message:'WAF_REVIEW_PREPARATION_UNCONFIRMED',remoteApplied:false}));process.exitCode=1;}
}
