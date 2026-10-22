// Pure project-scoped maintenance and exact public-perimeter transformation.
// No remote client; private IPs are retained only in the private prepared values.
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {buildContinuousProductionWafRule,baselineConfigurationSha256,sourceRuleId,matchesWafGroups} from './prepare-continuous-production-waf-proposal.mjs';
export const V2_WAF_PROJECTS=Object.freeze({bazaar:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',provider:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K'});
export const V2_WAF_TEAM='team_XjolcoWJ9V9yamVnCdpC7EMY';
export const V2_WAF_OLD_IDS=Object.freeze({bazaar:'dpl_GoDxiF8tYxB2bbHfs4BfGobia1T8',provider:'dpl_4hJwMXCu25MiRWtXFfQG8CKk3ify'});
export const V2_WAF_ORIGINS=Object.freeze({bazaar:'https://bazaar.browns.studio',provider:'https://ai-video-scriptwriter.vercel.app'});
export const V2_WAF_FAMILY='0cd860b8cfc35fc459b4838fa9092007';
export const v2WafCanonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(v2WafCanonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(v2WafCanonical(value[k]))])):value);
export const v2WafHash=value=>createHash('sha256').update(v2WafCanonical(value)).digest('hex');
const fail=code=>{throw Error(code);},fields=['name','description','active','conditionGroup','action'];
export const v2WafRuleValue=rule=>Object.fromEntries(fields.map(k=>[k,rule[k]]));
export function v2ProjectWafProtections(c,kind){
 if(!V2_WAF_PROJECTS[kind]||!c||Object.keys(c).some(k=>!['ownerId','crs','firewallEnabled','changes','ips','projectKey','version','id','updatedAt','rules','botIdEnabled','conditions','logHeaders','managedRules','rulesets'].includes(k))||!['ownerId','crs','firewallEnabled','changes','ips','projectKey','version','id','updatedAt','rules'].every(k=>Object.hasOwn(c,k))||![V2_WAF_PROJECTS[kind]+'#active',V2_WAF_PROJECTS[kind]+'#draft'].includes(c.projectKey)||!Array.isArray(c.rules)||c.rules.length>3||typeof c.firewallEnabled!=='boolean'||kind==='bazaar'&&c.firewallEnabled!==true||c.rules.some(r=>!/^rule_[A-Za-z0-9_-]+$/.test(r.id??'')||typeof r.active!=='boolean'||!Array.isArray(r.conditionGroup)||!r.conditionGroup.length||r.conditionGroup.length>25))fail('EXACT_OWNED_PROJECT_WAF_REQUIRED');
 return {ownerId:c.ownerId,projectId:V2_WAF_PROJECTS[kind],firewallEnabled:c.firewallEnabled,crs:c.crs,ips:c.ips,rules:c.rules.map(r=>({id:r.id,...v2WafRuleValue(r)})),...Object.fromEntries(['botIdEnabled','conditions','logHeaders','managedRules','rulesets'].filter(k=>Object.hasOwn(c,k)).map(k=>[k,c[k]]))};
}
export function validateV2BazaarBaseline(configuration,original){
 const got=v2ProjectWafProtections(configuration,'bazaar'),wanted=v2ProjectWafProtections(original,'bazaar');
 if(v2WafCanonical(got)!==v2WafCanonical(wanted)||configuration.rules.length!==1||configuration.rules[0].id!==sourceRuleId||configuration.rules[0].conditionGroup.length!==12||configuration.rules[0].active!==true||configuration.rules[0].action?.mitigate?.action!=='deny')fail('FRESH_RETIRED_TWELVE_GROUP_BASELINE_REQUIRED');
 const ips=configuration.rules[0].conditionGroup.flatMap(g=>g.conditions.filter(c=>c.type==='ip_address').map(c=>c.value));if(!ips.length||ips.some(ip=>typeof ip!=='string'||!isIP(ip))||new Set(ips).size!==1)fail('EXACT_PRIVATE_OPERATOR_IP_REQUIRED');
 return {protectionsHash:v2WafHash(got),operatorIpFingerprint:v2WafHash(ips[0])};
}
export function buildV2WriterDrain(configuration,kind){
 const projection=v2ProjectWafProtections(configuration,kind);
 if(projection.firewallEnabled!==true)fail('EXISTING_ENABLED_WAF_REQUIRED_NO_AUTOMATIC_ENABLE');
 if(configuration.rules.some(r=>r.active&&r.action?.mitigate?.action!=='deny'&&r.action?.mitigate?.action!=='log')||(Array.isArray(configuration.ips)&&configuration.ips.some(r=>['allow','bypass'].includes(r.action))))fail('PRIOR_BYPASS_OR_CHALLENGE_REQUIRES_SEPARATE_REVIEW');
 const conditionGroup=[{conditions:[{type:'path',op:'re',value:'^'}]}],selected=configuration.rules.find(r=>r.active&&r.action?.mitigate?.action==='deny'&&r.conditionGroup.length<25),baselineHash=v2WafHash(projection);
 if(selected){const rule={...structuredClone(selected),conditionGroup:[...structuredClone(selected.conditionGroup),...conditionGroup]},expected={...structuredClone(configuration),rules:configuration.rules.map(r=>r.id===selected.id?rule:structuredClone(r))};return {version:1,kind,mode:'extend-owned-deny',ruleId:selected.id,baselineHash,expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(expected,kind)),drainRuleFingerprint:v2WafHash(v2WafRuleValue(rule)),body:{action:'rules.update',id:selected.id,value:v2WafRuleValue(rule)},expected,projectWide:true,allEnvironments:true,allMethods:true,allPaths:true,allHosts:true,allIps:true,operatorBlocked:true};}
 if(configuration.rules.length>=3)fail('CUSTOM_RULE_CAPACITY_REQUIRES_SEPARATE_REVIEW');
 const value={name:'Bazaar V2 temporary writer drain '+kind,description:'Reviewed maintenance: block every route, method, host, environment and IP until guarded V2 sources replace old writers.',active:true,conditionGroup,action:{mitigate:{action:'deny'}}};
 return {version:1,kind,mode:'insert-owned-temporary-deny',ruleId:null,baselineHash,expectedProtectionsHash:null,drainRuleFingerprint:v2WafHash(value),body:{action:'rules.insert',id:null,value},expected:null,projectWide:true,allEnvironments:true,allMethods:true,allPaths:true,allHosts:true,allIps:true,operatorBlocked:true};
}
export function bindV2InsertedDrain(configuration,prepared,baseline){
 if(prepared.mode!=='insert-owned-temporary-deny')fail('EXACT_TEMPORARY_INSERT_PLAN_REQUIRED');
 v2ProjectWafProtections(configuration,prepared.kind);const added=configuration.rules.filter(r=>!baseline.rules.some(old=>old.id===r.id));
 if(added.length!==1||configuration.rules.length!==baseline.rules.length+1||v2WafHash(v2WafRuleValue(added[0]))!==prepared.drainRuleFingerprint)fail('EXACT_SINGLE_TEMPORARY_DRAIN_RULE_REQUIRED');
 const retained={...configuration,rules:configuration.rules.filter(r=>r.id!==added[0].id)};
 if(v2WafHash(v2ProjectWafProtections(retained,prepared.kind))!==prepared.baselineHash)fail('EXISTING_PROTECTIONS_CHANGED_DURING_DRAIN');
 return {...prepared,ruleId:added[0].id,expected:configuration,expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(configuration,prepared.kind))};
}
export function validateV2Drain(configuration,prepared){
 if(v2WafHash(v2ProjectWafProtections(configuration,prepared.kind))!==prepared.expectedProtectionsHash||v2WafHash(v2WafRuleValue(configuration.rules.find(r=>r.id===prepared.ruleId)))!==prepared.drainRuleFingerprint)fail('EXACT_ACTIVE_WRITER_DRAIN_REQUIRED');return true;
}
export function buildV2PublicPerimeter(configuration,original,hostname){
 validateV2BazaarBaseline(configuration,original);
 const transformed=buildContinuousProductionWafRule({sourceRule:configuration.rules[0],configurationSha256:baselineConfigurationSha256,finalDeploymentHostname:hostname});
 if(transformed.conditionGroups!==22)fail('EXACT_TWENTY_TWO_GROUP_PUBLIC_PERIMETER_REQUIRED');
 const expected={...structuredClone(configuration),rules:[transformed.rule]};return {kind:'bazaar',phase:'public',baselineProtectionsHash:v2WafHash(v2ProjectWafProtections(configuration,'bazaar')),expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(expected,'bazaar')),conditionGroups:22,productionHostname:hostname,exactExceptions:transformed.exactExceptions,body:{action:'rules.update',id:sourceRuleId,value:v2WafRuleValue(transformed.rule)},expected};
}
export function buildV2WriterRestore(baseline,drain,publicPlan){
 if(drain.kind==='bazaar'&&publicPlan){if(publicPlan.kind!=='bazaar'||publicPlan.conditionGroups!==22)fail('EXACT_PUBLIC_RESTORE_PLAN_REQUIRED');return {kind:'bazaar',expected:publicPlan.expected,expectedProtectionsHash:publicPlan.expectedProtectionsHash,body:publicPlan.body,conditionGroups:22};}
 if(drain.mode==='insert-owned-temporary-deny'){if(!/^rule_[A-Za-z0-9_-]+$/.test(drain.ruleId??''))fail('EXACT_CREATED_DRAIN_RULE_ID_REQUIRED');return {kind:drain.kind,expected:structuredClone(baseline),expectedProtectionsHash:drain.baselineHash,body:{action:'rules.remove',id:drain.ruleId},conditionGroups:null};}
 const originalRule=baseline.rules.find(r=>r.id===drain.ruleId);if(!originalRule)fail('EXACT_RETAINED_ORIGINAL_RULE_REQUIRED');return {kind:drain.kind,expected:structuredClone(baseline),expectedProtectionsHash:drain.baselineHash,body:{action:'rules.update',id:drain.ruleId,value:v2WafRuleValue(originalRule)},conditionGroups:originalRule.conditionGroup.length};
}
export function writerDrainMatches(request){return matchesWafGroups([{conditions:[{type:'path',op:'re',value:'^'}]}],request);}
export function buildV2HostQuarantine(kind,hosts,baseline){
 if(!V2_WAF_PROJECTS[kind]||!Array.isArray(hosts)||hosts.length<2||hosts.length>5||new Set(hosts).size!==hosts.length||hosts.some(h=>typeof h!=='string'||h.includes('*')||!/^([a-z0-9-]+\.)+[a-z]+$/.test(h))||!hosts.includes(new URL(V2_WAF_ORIGINS[kind]).hostname))fail('EXACT_VERIFIED_QUARANTINE_HOSTS_REQUIRED');
 if(baseline&&v2ProjectWafProtections(baseline,kind).rules.length>=3)fail('QUARANTINE_CUSTOM_RULE_CAPACITY_REQUIRED');
 const value={name:'Bazaar V2 verified hosts only '+kind,description:'Deny every other host, including old deployments and unknown aliases. Canonical aliases must point to verified guarded V2 code.',active:true,conditionGroup:[{conditions:[{type:'host',op:'inc',value:[...hosts].sort(),neg:true}]}],action:{mitigate:{action:'deny'}}};
 return {version:1,kind,mode:'insert-owned-host-quarantine',ruleId:null,approvedHosts:[...hosts].sort(),ruleFingerprint:v2WafHash(value),body:{action:'rules.insert',id:null,value}};
}
export function bindV2HostQuarantine(configuration,prepared,starting){
 v2ProjectWafProtections(configuration,prepared.kind);const added=configuration.rules.filter(r=>!starting.rules.some(old=>old.id===r.id));
 if(added.length!==1||configuration.rules.length!==starting.rules.length+1||v2WafHash(v2WafRuleValue(added[0]))!==prepared.ruleFingerprint)fail('EXACT_SINGLE_HOST_QUARANTINE_REQUIRED');
 const retained={...configuration,rules:configuration.rules.filter(r=>r.id!==added[0].id)};if(v2WafHash(v2ProjectWafProtections(retained,prepared.kind))!==v2WafHash(v2ProjectWafProtections(starting,prepared.kind)))fail('EXISTING_PROTECTIONS_CHANGED_DURING_QUARANTINE');
 return {...prepared,ruleId:added[0].id,expected:configuration,expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(configuration,prepared.kind))};
}
export function bindV2QuarantinedRestore(current,baseline,drain,quarantine,publicPlan){
 v2ProjectWafProtections(current,drain.kind);const guard=current.rules.find(r=>r.id===quarantine.ruleId);if(!guard||v2WafHash(v2WafRuleValue(guard))!==quarantine.ruleFingerprint)fail('ACTIVE_VERIFIED_HOST_QUARANTINE_REQUIRED');
 const plain={...current,rules:current.rules.filter(r=>r.id!==quarantine.ruleId)};validateV2Drain(plain,drain);
 const restore=buildV2WriterRestore(baseline,drain,publicPlan),expected={...structuredClone(current),rules:current.rules.flatMap(r=>r.id===drain.ruleId?(drain.mode==='insert-owned-temporary-deny'?[]:[restore.expected.rules.find(old=>old.id===r.id)]):[structuredClone(r)])};
 return {...restore,expected,expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(expected,drain.kind)),quarantineRuleId:quarantine.ruleId,approvedHosts:quarantine.approvedHosts};
}

// V3 adapter for a provider whose official config listing proves no WAF config.
// API errors, absent fields and unknown shapes are never interpreted as empty.
const denyAction={mitigate:{action:'deny',rateLimit:null,redirect:null,actionDuration:null}};
export function isConfirmedUnconfiguredProvider(listing){return listing!==null&&typeof listing==='object'&&!Array.isArray(listing)&&Object.keys(listing).sort().join(',')==='active,draft,versions'&&listing.active===null&&listing.draft===null&&Array.isArray(listing.versions)&&listing.versions.length===0;}
export const unconfiguredProviderFingerprint=()=>v2WafHash({projectId:V2_WAF_PROJECTS.provider,active:null,draft:null,versions:[]});
export function buildV3WriterDrain(configuration,kind){
 if(configuration!==null||kind!=='provider')return buildV2WriterDrain(configuration,kind);
 const value={name:'Bazaar V3 temporary writer drain provider',description:'Reviewed first custom WAF: deny every path, method, host, environment and IP until guarded sources and permanent quarantine are active.',active:true,conditionGroup:[{conditions:[{type:'path',op:'re',value:'^'}]}],action:structuredClone(denyAction)};
 return {version:3,kind,mode:'create-first-provider-deny',ruleId:null,baselineHash:unconfiguredProviderFingerprint(),expectedProtectionsHash:null,drainRuleFingerprint:v2WafHash(value),body:{firewallEnabled:true,rules:[{id:'rule_bazaar_v3_provider_drain',...value}],ips:[]},expected:null,projectWide:true,allEnvironments:true,allMethods:true,allPaths:true,allHosts:true,allIps:true,operatorBlocked:true,firstProviderWaf:true,serverDefaultsRequireReadback:true};
}
export function bindV3FirstProviderDrain(configuration,prepared,expectedOwner){
 if(prepared.mode!=='create-first-provider-deny'||prepared.kind!=='provider')fail('EXACT_FIRST_PROVIDER_WAF_PLAN_REQUIRED');
 v2ProjectWafProtections(configuration,'provider');
 if(configuration.ownerId!==expectedOwner||configuration.projectKey!==V2_WAF_PROJECTS.provider+'#active'||configuration.firewallEnabled!==true||!Array.isArray(configuration.ips)||configuration.ips.length!==0||configuration.rules.length!==1||configuration.rules[0].valid!==true||configuration.rules[0].validationErrors!=null&&(!Array.isArray(configuration.rules[0].validationErrors)||configuration.rules[0].validationErrors.length)||v2WafHash(v2WafRuleValue(configuration.rules[0]))!==prepared.drainRuleFingerprint)fail('FIRST_PROVIDER_WAF_DEFAULTS_REQUIRE_READ_ONLY_REVIEW');
 // No prior custom CRS/IP config existed. Preserve the server-created defaults
 // unchanged through all later phases; never update them or change SSO/DDOS.
 // PUT can allocate its own rule ID. This binds that opaque identifier only
 // after all five immutable rule fields match the exact reviewed request.
 return {...prepared,ruleId:configuration.rules[0].id,requestedRuleId:prepared.body.rules[0].id,serverAllocatedRuleId:configuration.rules[0].id!==prepared.body.rules[0].id,expected:configuration,expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(configuration,'provider')),createdDefaultsFingerprint:v2WafHash({ownerId:configuration.ownerId,firewallEnabled:configuration.firewallEnabled,crs:configuration.crs,ips:configuration.ips}),originalServerDefaults:{...structuredClone(configuration),rules:[]}};
}
export function buildV3HostQuarantine(kind,hosts,baseline){const plan=buildV2HostQuarantine(kind,hosts,baseline);plan.body.value.action=structuredClone(denyAction);plan.ruleFingerprint=v2WafHash(plan.body.value);return plan;}
export function bindV3QuarantinedRestore(current,baseline,drain,quarantine,publicPlan){
 if(drain.mode!=='create-first-provider-deny')return bindV2QuarantinedRestore(current,baseline,drain,quarantine,publicPlan);
 if(baseline!==null||drain.kind!=='provider'||!drain.originalServerDefaults)fail('EXACT_CREATED_PROVIDER_WAF_REQUIRED');
 const q=current.rules.find(r=>r.id===quarantine.ruleId);if(!q||v2WafHash(v2WafRuleValue(q))!==quarantine.ruleFingerprint)fail('ACTIVE_VERIFIED_HOST_QUARANTINE_REQUIRED');
 validateV2Drain({...current,rules:current.rules.filter(r=>r.id!==quarantine.ruleId)},drain);
 const expected={...structuredClone(current),rules:current.rules.filter(r=>r.id!==drain.ruleId)};
 return {kind:'provider',expected,expectedProtectionsHash:v2WafHash(v2ProjectWafProtections(expected,'provider')),body:{action:'rules.remove',id:drain.ruleId},quarantineRuleId:quarantine.ruleId,approvedHosts:quarantine.approvedHosts,firstProviderWafRetained:true,createdDefaultsFingerprint:drain.createdDefaultsFingerprint};
}
