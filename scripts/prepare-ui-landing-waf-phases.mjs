// Pure phase preparation. Returned bodies/expected configurations are private;
// no network, disk writes, credential reads, logging or deployment capability.
import {buildUiLandingAssetsWaf,UI_LANDING_WAF_BASELINE_HASH} from './prepare-ui-landing-assets-waf.mjs';
import {buildV4BazaarPerimeter,V4_PERIMETER} from './recovery-example-budget4-production-perimeter-recipe.mjs';
import {v2WafCanonical as canonical,v2WafHash as hash,v2ProjectWafProtections as protections,v2WafRuleValue as ruleValue} from './prepare-on-demand-production-v3-waf.mjs';

export const UI_HOTFIX_SOURCE='40e9459b6906a085982a869c7633d055360cfa71048512113fa22379db861ca5';
export const UI_ASSETS_ONLY_HASH='1f6f64a8e7e2d6360f67d1ad69783b521cce5a946b53c505b4177aa02796dc27';
export const UI_GUARDIAN_PATH='/api/market/guardian/tick';
const fail=code=>{throw Error(code);};
const configHash=configuration=>hash(protections(configuration,'bazaar'));
export function buildUiLandingWafPhases(baseline,{sourceDigest,stagedHostname,operatorIp}){
 if(sourceDigest!==UI_HOTFIX_SOURCE)fail('UI_APPROVED_HOTFIX_SOURCE_REQUIRED');
 const assets=buildUiLandingAssetsWaf(baseline);
 if(assets.summary.expectedHash!==UI_ASSETS_ONLY_HASH)fail('UI_APPROVED_ASSET_PATCH_REQUIRED');
 const oldQuarantine=baseline.rules.find(rule=>rule.id===V4_PERIMETER.rules.bazaar),oldHosts=oldQuarantine?.conditionGroup?.[0]?.conditions?.[0]?.value;
 const ips=baseline.rules.flatMap(rule=>rule.conditionGroup.flatMap(group=>group.conditions.filter(c=>c.type==='ip_address').map(c=>c.value)));
 if(!ips.length||ips.some(ip=>ip!==operatorIp)||!Array.isArray(oldHosts)||oldHosts.length!==3||oldHosts.filter(host=>host===V4_PERIMETER.canonicalBazaar).length!==1)fail('UI_EXISTING_OPERATOR_AND_THREE_HOSTS_REQUIRED');
 const guardedStage=buildV4BazaarPerimeter(baseline,{phase:'staging',operatorIp,stagedHostname}),stageQuarantine=guardedStage.expected.rules.find(rule=>rule.id===V4_PERIMETER.rules.bazaar);
 const staged=structuredClone(assets.expected);staged.rules=staged.rules.map(rule=>rule.id===V4_PERIMETER.rules.bazaar?structuredClone(stageQuarantine):rule);
 const final=structuredClone(assets.expected),finalQuarantine=final.rules.find(rule=>rule.id===V4_PERIMETER.rules.bazaar),finalPublic=final.rules.find(rule=>rule.id===assets.body.id);
 // Preserve the existing hourly guardian on its new immutable deployment host.
 // Rebase only its four existing host arrays; do not add an API or scheduler.
 const guardianHostEdits=[];let priorGuardianHost;
 for(const groupIndex of [1,8,12,19]){
  const matches=finalPublic.conditionGroup[groupIndex].conditions.filter(c=>c.type==='host'&&c.op==='inc'&&c.neg===true&&Array.isArray(c.value)&&c.value.includes(V4_PERIMETER.canonicalBazaar));
  if(matches.length!==1||matches[0].value.length!==2||matches[0].value.filter(host=>host===V4_PERIMETER.canonicalBazaar).length!==1)fail('UI_EXACT_EXISTING_GUARDIAN_HOST_ARRAYS_REQUIRED');
  const condition=matches[0],oldHost=condition.value.find(host=>host!==V4_PERIMETER.canonicalBazaar);
  if(priorGuardianHost&&oldHost!==priorGuardianHost||oldHost===stagedHostname)fail('UI_IDENTICAL_OLD_GUARDIAN_HOST_REQUIRED');priorGuardianHost=oldHost;
  guardianHostEdits.push({groupIndex,conditionIndex:finalPublic.conditionGroup[groupIndex].conditions.indexOf(condition),before:[...condition.value]});
  condition.value=condition.value.map(host=>host===priorGuardianHost?stagedHostname:host);
 }
 const undoPublic=structuredClone(finalPublic);
 for(const edit of guardianHostEdits)undoPublic.conditionGroup[edit.groupIndex].conditions[edit.conditionIndex].value=edit.before;
 if(canonical(undoPublic)!==canonical(assets.expected.rules.find(rule=>rule.id===assets.body.id)))fail('UI_ONLY_FOUR_GUARDIAN_HOST_ARRAYS_MAY_CHANGE');
 // NOT(canonical) AND NOT(new immutable host AND Production AND GET AND exact
 // guardian path). Every other new-host route loses the staging IP exception.
 const canonicalDeny={...structuredClone(oldQuarantine.conditionGroup[0].conditions[0]),value:[V4_PERIMETER.canonicalBazaar]};
 finalQuarantine.conditionGroup=[{type:'host',value:stagedHostname},{type:'environment',value:'production'},{type:'method',value:'GET'},{type:'path',value:UI_GUARDIAN_PATH}].map(other=>({conditions:[structuredClone(canonicalDeny),{...other,op:'eq',neg:true}]}));
 const restore=(configuration,originalRule)=>{const restored=structuredClone(configuration);restored.rules=restored.rules.map(rule=>rule.id===originalRule.id?structuredClone(originalRule):rule);return restored;};
 if(canonical(restore(staged,oldQuarantine))!==canonical(assets.expected)||canonical(restore(restore(final,oldQuarantine),assets.expected.rules.find(rule=>rule.id===assets.body.id)))!==canonical(assets.expected))fail('UI_ONLY_QUARANTINE_AND_GUARDIAN_HOSTS_MAY_CHANGE_AFTER_ASSETS');
 if(canonical(staged.rules.find(rule=>rule.id===assets.body.id))!==canonical(assets.expected.rules.find(rule=>rule.id===assets.body.id)))fail('UI_STAGING_PUBLIC_ASSET_PATCH_MUST_REMAIN_EXACT');
 const stagedHash=configHash(staged),finalHash=configHash(final);
 const phases={
  assetsOnly:{beforeHash:UI_LANDING_WAF_BASELINE_HASH,afterHash:UI_ASSETS_ONLY_HASH,expected:assets.expected,body:assets.body},
  stagingCombined:{beforeHash:UI_ASSETS_ONLY_HASH,afterHash:stagedHash,expected:staged,body:{action:'rules.update',id:oldQuarantine.id,value:ruleValue(stageQuarantine)}},
  finalCombined:{beforeHash:stagedHash,afterHash:finalHash,expected:final,bodies:[{action:'rules.update',id:finalPublic.id,value:ruleValue(finalPublic)},{action:'rules.update',id:oldQuarantine.id,value:ruleValue(finalQuarantine)}]}
 };
 return {phases,summary:{version:1,status:'PREPARED_LOCAL_UI_WAF_PHASES',sourceDigest,stagedHostname,baselineHash:UI_LANDING_WAF_BASELINE_HASH,assetsOnlyHash:UI_ASSETS_ONLY_HASH,stagingCombinedHash:stagedHash,finalCombinedHash:finalHash,publicRuleReadRegexChanges:8,finalGuardianHostArraysRebased:4,stagingOnlyExistingOperatorIpAndProduction:true,finalCanonicalHost:V4_PERIMETER.canonicalBazaar,finalImmutableException:{host:stagedHostname,environment:'production',method:'GET',path:UI_GUARDIAN_PATH,existingHandlerAuthenticationRequired:true},retiredImmutableHosts:oldHosts.filter(host=>host!==V4_PERIMETER.canonicalBazaar),priorGuardianHostRemoved:true,newImmutableOtherPathsClosedAtFinal:true,finalDraftRuleUpdates:2,finalDraftActivations:1,otherFieldsPreserved:true,providerChanged:false,ssoChanged:false,cronScheduleChanged:false,cloudWrites:0}};
}
export function requireUiLandingPhaseBaseline(fresh,prepared,phase){
 if(!['assetsOnly','stagingCombined','finalCombined'].includes(phase)||prepared?.summary?.sourceDigest!==UI_HOTFIX_SOURCE||configHash(fresh)!==prepared.phases[phase].beforeHash)fail('UI_EXACT_FRESH_PHASE_BASELINE_REQUIRED');
 const selected=prepared.phases[phase],bodies=selected.bodies??[selected.body];
 if(configHash(selected.expected)!==selected.afterHash||bodies.length!==(phase==='finalCombined'?2:1))fail('UI_EXACT_PHASE_BODY_REQUIRED');
 for(const body of bodies){const expectedRule=selected.expected.rules.find(rule=>rule.id===body.id);if(canonical(body)!==canonical({action:'rules.update',id:expectedRule?.id,value:expectedRule?ruleValue(expectedRule):null}))fail('UI_EXACT_PHASE_BODY_REQUIRED');}
 return selected.bodies??selected.body;
}
