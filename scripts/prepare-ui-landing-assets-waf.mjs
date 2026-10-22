// Pure transformation. The returned request body retains the private operator IP;
// callers must keep it private. This module has no I/O or application capability.
import {v2WafCanonical as canonical,v2WafHash as hash,v2ProjectWafProtections as protections,v2WafRuleValue as ruleValue,V2_WAF_PROJECTS,V2_WAF_TEAM} from './prepare-on-demand-production-v3-waf.mjs';

export const UI_LANDING_WAF_BASELINE_HASH='b80bf3ca1bd90fbba00d4bcda9c76478d6664cb7ec9acbf76f219289fb4ac69c';
export const UI_LANDING_PUBLIC_RULE='rule_bazaar_acceptance_egress_only_iPEa7V';
export const UI_LANDING_ASSETS=Object.freeze(['/demo-deliveries/afiche-orbita.png','/demo-deliveries/afiche-pulso.png','/demo-deliveries/clip-demostracion.mp4','/demo-deliveries/subtitulos.vtt']);
export const UI_LANDING_ASSET_PATTERN='^/demo-deliveries/(?:afiche-orbita\\.png|afiche-pulso\\.png|clip-demostracion\\.mp4|subtitulos\\.vtt)$';
const readGroups=Object.freeze([6,7,8,9,17,18,19,20]);
const fail=code=>{throw Error(code);};
function changedPaths(before,after,path=''){
 if(canonical(before)===canonical(after))return[];
 if(before===null||after===null||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)!==Array.isArray(after))return[path];
 const keys=new Set([...Object.keys(before),...Object.keys(after)]);
 return [...keys].flatMap(key=>!Object.hasOwn(before,key)||!Object.hasOwn(after,key)?[path+'.'+key]:changedPaths(before[key],after[key],path?path+'.'+key:key));
}
export function buildUiLandingAssetsWaf(configuration){
 const projection=protections(configuration,'bazaar');
 if(configuration.ownerId!==V2_WAF_TEAM||configuration.projectKey!==V2_WAF_PROJECTS.bazaar+'#active'||hash(projection)!==UI_LANDING_WAF_BASELINE_HASH||configuration.rules.length!==2)fail('UI_FRESH_IDENTICAL_WAF_BASELINE_REQUIRED');
 const ruleIndex=configuration.rules.findIndex(rule=>rule.id===UI_LANDING_PUBLIC_RULE),original=configuration.rules[ruleIndex];
 if(ruleIndex<0||!original.active||original.action?.mitigate?.action!=='deny'||original.conditionGroup.length!==22)fail('UI_EXACT_EXISTING_PUBLIC_RULE_REQUIRED');
 const expected=structuredClone(configuration),rule=expected.rules[ruleIndex],edits=[];
 for(const groupIndex of readGroups){
  const group=rule.conditionGroup[groupIndex],methods=group.conditions.filter(c=>c.type==='method'),paths=group.conditions.filter(c=>c.type==='path'&&c.op==='re');
  if(methods.length!==1||methods[0].op!=='eq'||methods[0].neg===true||!['GET','HEAD'].includes(methods[0].value)||paths.length!==1||paths[0].neg!==true||typeof paths[0].value!=='string'||!new RegExp(paths[0].value).test('/')||UI_LANDING_ASSETS.some(path=>new RegExp(paths[0].value).test(path)))fail('UI_EXACT_READ_PATH_SHAPE_REQUIRED');
  const conditionIndex=group.conditions.indexOf(paths[0]),old=paths[0].value;
  paths[0].value='(?:'+old+'|'+UI_LANDING_ASSET_PATTERN+')';
  edits.push({groupIndex,conditionIndex,path:`rules.${ruleIndex}.conditionGroup.${groupIndex}.conditions.${conditionIndex}.value`,beforeRegexSha256:hash(old),afterRegexSha256:hash(paths[0].value)});
 }
 const delta=changedPaths(configuration,expected);
 if(canonical(delta.sort())!==canonical(edits.map(edit=>edit.path).sort())||edits.length!==8)fail('UI_ONLY_EIGHT_READ_REGEX_VALUES_MAY_CHANGE');
 // Restoring just the eight values must reconstruct every original property.
 const undo=structuredClone(expected);
 for(const edit of edits)undo.rules[ruleIndex].conditionGroup[edit.groupIndex].conditions[edit.conditionIndex].value=original.conditionGroup[edit.groupIndex].conditions[edit.conditionIndex].value;
 if(canonical(undo)!==canonical(configuration))fail('UI_UNRELATED_WAF_PROPERTY_CHANGED');
 return {expected,body:{action:'rules.update',id:UI_LANDING_PUBLIC_RULE,value:ruleValue(rule)},summary:{version:1,status:'PREPARED_LOCAL_EXACT_UI_ASSETS_ONLY',baselineHash:UI_LANDING_WAF_BASELINE_HASH,expectedHash:hash(protections(expected,'bazaar')),ruleId:UI_LANDING_PUBLIC_RULE,groupsBefore:22,groupsAfter:22,changedRegexValues:edits.length,edits,assets:[...UI_LANDING_ASSETS],methods:['GET','HEAD'],existingHostEnvironmentAndIpConditionsPreserved:true,unrelatedRulesPreserved:true,apiConditionsPreserved:true,cloudWrites:0}};
}
