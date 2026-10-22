// Pure rotation of the sole temporary Preview exception; no cloud client.
import {createHash} from 'node:crypto';
import {buildFreePreviewWafRule,FREE_PREVIEW_HOST} from './prepare-free-demo-preview-waf.mjs';
import {ownedWafProtections} from '../.vercel/continuous-production-waf-control.mjs';
import {freePreviewBaseline} from '../.vercel/free-demo-preview-waf-control.mjs';
export const ON_DEMAND_WAF_PROJECT='prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3';
export const ON_DEMAND_WAF_TEAM='team_XjolcoWJ9V9yamVnCdpC7EMY';
export const CURRENT_PREVIEW_WAF_HASH='ad5e8af080ceac7bf74814db32bedfe1438a5bb5f7be7175cdfe3b741fed13c2';
export const wafCanonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(wafCanonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(wafCanonical(value[k]))])):value);
export const wafHash=value=>createHash('sha256').update(wafCanonical(value)).digest('hex');
const fail=code=>{throw Error(code);};
export function onDemandPreviewReceipt(receipt,candidate,previewPlan){
 if(candidate?.kind!=='bazaar'||candidate.environment!=='preview'||!/^[a-f0-9]{64}$/.test(candidate.sourceDigest??'')||!/^[a-f0-9]{64}$/.test(candidate.manifestSha256??'')||!/^dpl_[A-Za-z0-9]+$/.test(receipt?.deploymentId??'')||receipt.projectId!==ON_DEMAND_WAF_PROJECT||!['preview',null].includes(receipt.target)||receipt.status!=='ON_DEMAND_PROTECTED_PREVIEW_READY'||receipt.stage!=='bootstrap'||receipt.readyState!=='READY'||receipt.sourceDigest!==candidate.sourceDigest||receipt.manifestSha256!==candidate.manifestSha256||receipt.candidate!==`continuous-on-demand-bazaar-preview-${candidate.sourceDigest.slice(0,16)}`||!/^[a-f0-9]{64}$/.test(previewPlan?.planHash??'')||receipt.planHash!==previewPlan.planHash||!/^[-a-f0-9]{36}$/.test(receipt.intentId??'')||receipt.payments!==0||receipt.productionPublished!==false||receipt.cronActivated!==false||receipt.purchasesEnabled!==false||receipt.filesEnabled!==false||JSON.stringify(receipt.crons??null)!=='[]')fail('EXACT_CLOSED_ON_DEMAND_PREVIEW_RECEIPT_REQUIRED');
 let url;try{url=new URL(receipt.url);}catch{fail('EXACT_ON_DEMAND_PREVIEW_HOST_REQUIRED');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||!/^stellar-bazaar-x402-[a-z0-9]{5,40}-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(url.hostname)||url.hostname===FREE_PREVIEW_HOST)fail('EXACT_ON_DEMAND_PREVIEW_HOST_REQUIRED');
 return {deploymentId:receipt.deploymentId,hostname:url.hostname,sourceDigest:candidate.sourceDigest,candidate:receipt.candidate,manifestSha256:candidate.manifestSha256,previewPlanHash:receipt.planHash,previewIntentId:receipt.intentId,previewStage:receipt.stage};
}
export function validateCurrentOnDemandWaf(active,oldPrepared){
 freePreviewBaseline(oldPrepared?.configuration);
 if(wafHash(ownedWafProtections(active))!==CURRENT_PREVIEW_WAF_HASH||wafHash(ownedWafProtections(oldPrepared?.expected))!==CURRENT_PREVIEW_WAF_HASH||active.rules?.[0]?.conditionGroup?.length!==18||oldPrepared.configuration?.rules?.[0]?.conditionGroup?.length!==12)fail('OWNED_CURRENT_PREVIEW_WAF_CHANGED');
 const rebuilt=buildFreePreviewWafRule(oldPrepared.configuration.rules[0]);
 if(wafCanonical(rebuilt)!==wafCanonical(oldPrepared.expected.rules[0]))fail('EXACT_ORIGINAL_PREVIEW_WAF_BASE_REQUIRED');
 return true;
}
export function buildOnDemandPreviewWaf(active,oldPrepared,binding,phase='rotate'){
 validateCurrentOnDemandWaf(active,oldPrepared);
 if(!['rotate','retire'].includes(phase)||!binding||!/^dpl_[A-Za-z0-9]+$/.test(binding.deploymentId??'')||!/^[a-f0-9]{64}$/.test(binding.sourceDigest??'')||!/^stellar-bazaar-x402-[a-z0-9]{5,40}-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(binding.hostname??'')||binding.hostname===FREE_PREVIEW_HOST)fail('EXACT_ON_DEMAND_PREVIEW_BINDING_REQUIRED');
 const original=structuredClone(oldPrepared.configuration),rule=phase==='retire'?original.rules[0]:buildFreePreviewWafRule(original.rules[0]);
 if(phase==='rotate')for(const group of rule.conditionGroup)for(const condition of group.conditions)if(condition.type==='host'&&condition.value===FREE_PREVIEW_HOST)condition.value=binding.hostname;
 const expected={...structuredClone(active),rules:[rule]},expectedProtectionsHash=wafHash(ownedWafProtections(expected)),originalProtectionsHash=wafHash(ownedWafProtections(original));
 const rotated=phase==='rotate'?expected:buildOnDemandPreviewWaf(active,oldPrepared,binding,'rotate').expected;
 const baselineProtectionsHash=phase==='rotate'?CURRENT_PREVIEW_WAF_HASH:wafHash(ownedWafProtections(rotated));
 const plan={version:1,phase,projectId:ON_DEMAND_WAF_PROJECT,binding,baselineProtectionsHash,expectedProtectionsHash,originalProtectionsHash,conditionGroups:rule.conditionGroup.length,exception:phase==='rotate'?{environment:'preview',host:binding.hostname,path:'/api/mcp',methods:['GET','POST']}:null,retiredHostname:phase==='rotate'?FREE_PREVIEW_HOST:binding.hostname,productionBehaviorChanged:false,protectionPreserved:true,purchasesOpened:false,cronActivated:false,payments:0};
 return {plan:{...plan,planHash:wafHash(plan)},expected,body:{action:'rules.update',id:rule.id,value:Object.fromEntries(['name','description','active','conditionGroup','action'].map(k=>[k,rule[k]]))}};
}
