// Offline release-plan validators only. No CLI, profiles, network or mutations.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyOnDemandSources} from './prepare-on-demand-sources.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const fail=code=>{throw Error(code);};
export const ON_DEMAND_RELEASE_PROPOSAL='docs/release/continuous-on-demand-source-proposal-2026-10-11.json';
export const ON_DEMAND_PROJECTS=Object.freeze({bazaar:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',provider:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K'});
export function onDemandReleasePlan(kind,environment,source,proposal,proposalHash){
 if(!['bazaar','provider'].includes(kind)||!['preview','production'].includes(environment)||!/^[a-f0-9]{64}$/.test(proposalHash??''))fail('EXACT_ON_DEMAND_RELEASE_SELECTION_REQUIRED');
 const pin=proposal.outputs?.find(v=>v.kind===kind&&v.environment===environment),crons=kind==='bazaar'&&environment==='production'?[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}]:[];
 if(proposal.status!=='FROZEN_ON_DEMAND_SOURCES_PREVIEW_PENDING'||proposal.operationMode!=='continuous-on-demand'||proposal.hasAdmissionDeadline!==false||proposal.productionPublished!==false||proposal.cronActivated!==false||proposal.payments!==0||!pin||pin.sourceDigest!==source.sourceDigest||pin.manifestSha256!==source.manifestSha256||pin.sourceDirectory!==source.sourceDirectory||canonical(source.cronSchedules)!==canonical(crons))fail('EXACT_NEW_FROZEN_ON_DEMAND_PINS_REQUIRED');
 const settings=kind==='bazaar'?{BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_ENABLE_MARKET_PURCHASES:'false',BAZAAR_MARKET_FILES_ENABLED:'false'}:{BAZAAR_SELLER_EXECUTION_MODE:'on-demand',BAZAAR_HOSTED_SELLER_ENABLED:'true',BAZAAR_MARKETPLACE_TEXT_ENABLED:'true'};
 const plan={version:1,kind,environment,projectId:ON_DEMAND_PROJECTS[kind],teamId:'team_XjolcoWJ9V9yamVnCdpC7EMY',proposalHash,candidate:source.candidate??pin.candidate,sourceDirectory:source.sourceDirectory,sourceDigest:source.sourceDigest,manifest:source.manifest,manifestSha256:source.manifestSha256,files:source.files,crons,nonSecretSettings:settings,removeEnvironmentKeys:['BAZAAR_FREE_DEMO_ADMISSION_UNTIL'],existingNamespaceAndAccountBindingsOnly:true,paidRecoveryPreserved:true,providerPolling:false,deploymentIntent:`.vercel/continuous-on-demand-${kind}-${environment}-deploy-intent.json`,environmentIntent:`.vercel/continuous-on-demand-${kind}-${environment}-environment-intent.json`,environmentReceipt:`.vercel/continuous-on-demand-${kind}-${environment}-environment-receipt.json`,readyReceipt:`docs/evidence/continuous-on-demand-${kind}-${environment}-deployment-2026-10-11.json`,privateValuesInArguments:false,mutationAdapterPrepared:false,previewAcceptancePending:true,payments:0,productionPublished:false,cronActivated:false};
 return {...plan,planHash:sha(canonical(plan))};
}
export function onDemandReleaseApproval(plan,approval,actualProposalHash){if(approval?.approvedPlanHash!==plan.planHash||approval.approvedReviewHash!==actualProposalHash||actualProposalHash!==plan.proposalHash)fail('EXACT_NEW_JOINT_RELEASE_APPROVAL_REQUIRED');return true;}
export function matchOnDemandReleaseDeployment(raw,intent,plan,{ready=false}={}){
 const d=raw.deployment??raw,target=plan.environment==='production'?d.target==='production':['preview',null].includes(d.target),host=String(d.url??'').replace(/^https:\/\//,'');
 const pattern=plan.kind==='bazaar'?/^stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/:/^ai-video-scriptwriter-[a-z0-9]+(?:-cabscryptocontacto-6028s-projects)?\.vercel\.app$/;
 if(d.projectId!==plan.projectId||!target||!/^dpl_[a-zA-Z0-9]+$/.test(d.id??'')||!pattern.test(host)||canonical(d.crons??[])!==canonical(plan.crons)||d.meta?.sourceDigest!==plan.sourceDigest||d.meta?.onDemandPlanHash!==plan.planHash||d.meta?.onDemandIntentId!==intent.intentId||ready&&d.readyState!=='READY')fail('EXACT_NEW_ON_DEMAND_DEPLOYMENT_REQUIRED');return {deploymentId:d.id,url:'https://'+host,readyState:d.readyState,target:d.target};
}
export async function onDemandReleaseCheck(kind,environment,root=process.cwd()){
 root=resolve(root);const raw=await readFile(resolve(root,ON_DEMAND_RELEASE_PROPOSAL)),proposal=JSON.parse(raw);
 if(proposal.status==='AWAITING_ROOT_RUNTIME_FREEZE')return {status:'AWAITING_ROOT_RUNTIME_FREEZE',kind,environment,proposalHash:sha(raw),networkRequests:0,privateProfilesRead:0,payments:0,productionPublished:false,cronActivated:false};
 const verified=await verifyOnDemandSources(root),source=verified.outputs.find(v=>v.kind===kind&&v.environment===environment);
 const plan=onDemandReleasePlan(kind,environment,source,proposal,sha(raw));return {status:'FROZEN_RELEASE_PLAN_REQUIRES_EXECUTABLE_ADAPTER_REVIEW',...plan,networkRequests:0,privateProfilesRead:0,deployments:0};
}
