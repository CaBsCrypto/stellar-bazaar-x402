// Private local measurement access. Synthetic new prefixes only; never deploys.
import {readFile,open,lstat} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isolatedActorTransform} from '../.vercel/readiness-guard-fix-isolated-actors.mjs';
import {sha,fail,zero,privateInput,redisCommands,publicReceipt,exclusive,originalJournalUnchanged} from './recovery-example-preview-lib.mjs';

export const LOCAL_ACCESS=Object.freeze({purpose:'bazaar-recovery-example-native-local-measurement/v1',url:'https://smooth-dory-323957.upstash.io',journal:'.vercel/recovery-example-budget-local-profile.dpapi',driver:'scripts/recovery-example-native-local-measurement.mjs',driverIntent:'.vercel/recovery-example-budget-local-measurement-intent.json',previousProfile:'.vercel/recovery-example-preview-profile.dpapi',previousReceipt:'docs/evidence/recovery-example-preview-native-2026-10-12.json',productionFamily:'pilot-0cd860b8cfc35fc459b4838fa9092007'});
export const LOCAL_ACL_PERMISSIONS=Object.freeze(['get','set','del','exists','eval','pttl','time','ping','smembers','sadd','srem']);
const access=/^[A-Za-z0-9_-]{43}$/,hex=/^[a-f0-9]{64}$/,tokenShape=value=>typeof value==='string'&&value.length>=16&&value.length<=4096&&!/[\s\u0000-\u001f]/.test(value);
const safeCode=error=>/^[A-Z][A-Z0-9_]{2,95}$/.test(error?.message??'')?error.message:'LOCAL_BUDGET_ACCESS_UNCONFIRMED';
const actor=()=>({creationId:randomUUID(),bootstrap:randomBytes(32).toString('base64url'),human:randomBytes(32).toString('base64url'),agent:randomBytes(32).toString('base64url')});
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
export function localMeasurementPrefixes(profile){
 if(!/^pilot-[a-f0-9]{32}$/.test(profile?.family??''))fail('LOCAL_FRESH_MEASUREMENT_FAMILY_REQUIRED');const nonce=profile.family.slice(6);
 return ['bazaar-workspace:'+profile.family,'bazaar-market:'+profile.family,'bazaar-review:'+profile.family,'bazaar-seller:preview-'+nonce,'bazaar-seller:preview-'+sha('runtime:'+nonce).slice(0,32)];
}
export function validateLocalMeasurementProfile(profile,{ready=true}={}){
 const fields=['purpose','family','url','token','workspacePrefix','marketPrefix','reviewPrefix','workerPrefix','runtimePrefix','actors','workerWakeToken','providerToken','storeKey','operator','reviewSecret','syntheticFixtures','forbiddenFamilyFingerprints'];
 if(!exact(profile,fields)||profile.purpose!==LOCAL_ACCESS.purpose||profile.url!==LOCAL_ACCESS.url||profile.syntheticFixtures!==true||!Array.isArray(profile.forbiddenFamilyFingerprints)||profile.forbiddenFamilyFingerprints.length!==2||new Set(profile.forbiddenFamilyFingerprints).size!==2||profile.forbiddenFamilyFingerprints.some(value=>!hex.test(value))||profile.forbiddenFamilyFingerprints[0]!==sha(LOCAL_ACCESS.productionFamily)||profile.forbiddenFamilyFingerprints.includes(sha(profile.family))||ready&&!tokenShape(profile.token)||!ready&&profile.token!==null&&!tokenShape(profile.token))fail('LOCAL_EXACT_PRIVATE_MEASUREMENT_PROFILE_REQUIRED');
 const prefixes=localMeasurementPrefixes(profile);for(const [index,name]of ['workspacePrefix','marketPrefix','reviewPrefix','workerPrefix','runtimePrefix'].entries())if(profile[name]!==prefixes[index])fail('LOCAL_FIVE_FRESH_PREFIXES_REQUIRED');
 if(!exact(profile.actors,['buyer','seller']))fail('LOCAL_TWO_NATIVE_ACTOR_INTENTS_REQUIRED');
 const actorSecrets=[];for(const value of Object.values(profile.actors)){if(!exact(value,['creationId','bootstrap','human','agent'])||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.creationId)||!['bootstrap','human','agent'].every(name=>access.test(value[name]??'')))fail('LOCAL_NATIVE_ACTOR_SECRET_REQUIRED');actorSecrets.push(value.bootstrap,value.human,value.agent);}
 const privateSecrets=[...actorSecrets,...['workerWakeToken','providerToken','storeKey','operator','reviewSecret'].map(name=>profile[name])];
 if(profile.actors.buyer.creationId===profile.actors.seller.creationId||privateSecrets.some(value=>!access.test(value??''))||new Set(privateSecrets).size!==privateSecrets.length)fail('LOCAL_DISTINCT_PRIVATE_ACTOR_ACCESS_REQUIRED');
 if(ready&&privateSecrets.includes(profile.token))fail('LOCAL_SCOPED_TOKEN_DISTINCT_REQUIRED');return profile;
}
export function freshLocalAccessIntent({previousProfileSha256,previousFamilyFingerprint}){
 if(!hex.test(previousProfileSha256??'')||!hex.test(previousFamilyFingerprint??'')||previousFamilyFingerprint===sha(LOCAL_ACCESS.productionFamily))fail('LOCAL_OLD_PROFILE_FINGERPRINTS_REQUIRED');
 const family='pilot-'+randomBytes(16).toString('hex'),prefixes=localMeasurementPrefixes({family});
 const profile={purpose:LOCAL_ACCESS.purpose,family,url:LOCAL_ACCESS.url,token:null,...Object.fromEntries(['workspacePrefix','marketPrefix','reviewPrefix','workerPrefix','runtimePrefix'].map((name,index)=>[name,prefixes[index]])),actors:{buyer:actor(),seller:actor()},workerWakeToken:randomBytes(32).toString('base64url'),providerToken:randomBytes(32).toString('base64url'),storeKey:randomBytes(32).toString('base64url'),operator:randomBytes(32).toString('base64url'),reviewSecret:randomBytes(32).toString('base64url'),syntheticFixtures:true,forbiddenFamilyFingerprints:[sha(LOCAL_ACCESS.productionFamily),previousFamilyFingerprint]};
 validateLocalMeasurementProfile(profile,{ready:false});
 return {version:1,purpose:LOCAL_ACCESS.purpose,phase:'prepared',createdAt:new Date().toISOString(),aclUser:'bazaar_example_budget_local_'+family.slice(6),previousProfileSha256,profile};
}
export function exactLocalAcl(value,prefixes){
 const user=Array.isArray(value)&&value.length%2===0?Object.fromEntries(Array.from({length:value.length/2},(_,index)=>[value[index*2],value[index*2+1]])):value;
 const patterns=raw=>typeof raw==='string'?raw.trim().split(/\s+/).filter(Boolean):Array.isArray(raw)&&raw.every(name=>typeof name==='string')?raw:null;
 if(!user||Object.keys(user).some(name=>!['flags','passwords','commands','keys','channels','selectors'].includes(name))||!Array.isArray(user.flags)||!Array.isArray(user.passwords)||typeof user.commands!=='string'||!patterns(user.keys)||user.channels!==undefined&&!patterns(user.channels)||user.selectors!==undefined&&(!Array.isArray(user.selectors)||user.selectors.length))return false;
 const same=(left,right)=>JSON.stringify([...left].sort())===JSON.stringify([...right].sort());
 return user.flags.includes('on')&&user.flags.every(value=>['on','sanitize-payload'].includes(value))&&user.passwords.length===1&&hex.test(user.passwords[0])&&same(user.commands.trim().split(/\s+/),['-@all',...LOCAL_ACL_PERMISSIONS.map(name=>'+'+name)])&&same(patterns(user.keys).map(name=>name.startsWith('~')?name.slice(1):name),prefixes.map(prefix=>prefix+':*'))&&(user.channels===undefined||patterns(user.channels).length===0)&&(user.selectors===undefined||user.selectors.length===0);
}
export function localAccessJournal({transform=isolatedActorTransform,path=LOCAL_ACCESS.journal}={}){
 return {async read(){const info=await lstat(path).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});if(!info)return undefined;if(!info.isFile()||info.isSymbolicLink()||info.size>524288)fail('LOCAL_PRIVATE_ACCESS_JOURNAL_BOUND');const line=(await readFile(path,'utf8')).trim().split('\n').at(-1);if(!/^[A-Za-z0-9+/]+=*$/.test(line??''))fail('LOCAL_PRIVATE_ACCESS_JOURNAL_INVALID');const plain=await transform('unseal',Buffer.from(line,'base64'));try{const j=JSON.parse(plain.toString());if(j.version!==1||j.purpose!==LOCAL_ACCESS.purpose||j.profile?.purpose!==LOCAL_ACCESS.purpose||j.aclUser!=='bazaar_example_budget_local_'+j.profile.family.slice(6)||!hex.test(j.previousProfileSha256))fail('LOCAL_PRIVATE_ACCESS_JOURNAL_BINDING');validateLocalMeasurementProfile(j.profile,{ready:j.phase==='access-ready'||j.phase==='measurement-started'||j.phase==='measured'});return j;}finally{plain.fill(0);}},async write(j,initial=false){const plain=Buffer.from(JSON.stringify(j));let cipher;try{cipher=await transform('seal',plain);}finally{plain.fill(0);}const handle=await open(path,initial?'wx':'a',0o600);try{await handle.writeFile(cipher.toString('base64')+'\n');await handle.sync();}finally{cipher.fill(0);await handle.close();}}};
}
async function previousBinding(){
 const bytes=await readFile(LOCAL_ACCESS.previousProfile),proof=JSON.parse(await readFile(LOCAL_ACCESS.previousReceipt));
 if(proof.status!=='PASS_REAL_ISOLATED_NATIVE_SETUP'||!hex.test(proof.familyFingerprint??'')||proof.originalFinancialJournalUnchanged===false)fail('LOCAL_PREVIOUS_REAL_PREVIEW_EVIDENCE_REQUIRED');
 return {previousProfileSha256:sha(bytes),previousFamilyFingerprint:proof.familyFingerprint};
}
async function preservePrevious(j){if(sha(await readFile(LOCAL_ACCESS.previousProfile))!==j.previousProfileSha256)fail('LOCAL_PREVIOUS_PREVIEW_PROFILE_CHANGED');await originalJournalUnchanged();return true;}
export async function runLocalAccess(action,packet,{journal=localAccessJournal(),oldBinding=previousBinding,checkOld=preservePrevious,transportFactory=redisCommands,writeReceipt=publicReceipt}={}){
 if(!['prepare','acl','recover-acl'].includes(action)||packet?.url!==LOCAL_ACCESS.url||!tokenShape(packet?.token))fail('LOCAL_EXISTING_ADMIN_STDIN_ONLY_REQUIRED');
 let j=await journal.read();
 if(action==='prepare'){
  if(j)fail('LOCAL_NEW_ENCRYPTED_ACCESS_PROFILE_REQUIRED');j=freshLocalAccessIntent(await oldBinding());await checkOld(j);await journal.write(j,true);
  const result={status:'PREPARED_ENCRYPTED_NATIVE_LOCAL_MEASUREMENT_ACCESS',familyFingerprint:sha(j.profile.family),prefixFingerprints:localMeasurementPrefixes(j.profile).map(sha),phase:j.phase,actorIntents:2,syntheticFixtures:true,profilePath:LOCAL_ACCESS.journal,masterRedisPersisted:false,redisRequests:0,privateProfilesDecrypted:0,...zero};
  await writeReceipt('docs/evidence/recovery-example-budget-local-access-prepared-2026-10-12.json',result);return result;
 }
 if(!j||action==='acl'&&j.phase!=='prepared'||action==='recover-acl'&&!['acl-started','acl-installed'].includes(j.phase))fail('LOCAL_FRESH_OR_UNCERTAIN_ACL_PHASE_REQUIRED');
 await checkOld(j);const prefixes=localMeasurementPrefixes(j.profile),admin=transportFactory(packet,{adminUser:j.aclUser,maximum:6});
 if(action==='acl'){
  if(await admin.command(['ACL','GETUSER',j.aclUser])!==null)fail('LOCAL_ACL_NAME_COLLISION');
  j.phase='token-started';await journal.write(j);const scoped=await admin.command(['ACL','GENTOKEN',j.aclUser]);
  if(!tokenShape(scoped)||scoped===packet.token)fail('LOCAL_DISTINCT_SCOPED_REDIS_ACCESS_REQUIRED');j.profile.token=scoped;j.phase='token-prepared';await journal.write(j);
  j.phase='acl-started';await journal.write(j);if(await admin.command(['ACL','SETUSER',j.aclUser,'reset','on','>'+scoped,...prefixes.map(prefix=>'~'+prefix+':*'),...LOCAL_ACL_PERMISSIONS.map(name=>'+'+name)])!=='OK')fail('LOCAL_NEW_ACL_UNCONFIRMED');j.phase='acl-installed';await journal.write(j);
 }
 const observed=await admin.command(['ACL','GETUSER',j.aclUser]);if(!exactLocalAcl(observed,prefixes))fail('LOCAL_EXACT_FIVE_PREFIX_ACL_UNCONFIRMED');
 const deniedKey='bazaar-example-local-denied:'+sha(j.profile.family)+':probe',scoped=transportFactory({url:packet.url,token:j.profile.token},{prefixes,expectedDeniedKey:deniedKey,maximum:8});
 for(const prefix of prefixes)if(await scoped.command(['GET',prefix+':fresh-profile-collision-probe'])!==null)fail('LOCAL_FRESH_NAMESPACE_COLLISION');
 if((await scoped.command(['GET',deniedKey])).denied!==true)fail('LOCAL_SCOPED_ACCESS_ISOLATION_UNCONFIRMED');
 validateLocalMeasurementProfile(j.profile);await checkOld(j);j.phase='access-ready';j.aclVerifiedAt=new Date().toISOString();await journal.write(j);
 const result={status:action==='acl'?'PASS_NEW_FIVE_PREFIX_LOCAL_MEASUREMENT_ACL':'PASS_READ_ONLY_LOCAL_MEASUREMENT_ACL_RECOVERED',familyFingerprint:sha(j.profile.family),prefixFingerprints:prefixes.map(sha),permissionNames:LOCAL_ACL_PERMISSIONS,adminTransport:admin.snapshot(),scopedTransport:scoped.snapshot(),foreignKeysDenied:true,profilePath:LOCAL_ACCESS.journal,previousPreviewProfileUnchanged:true,originalFinancialJournalUnchanged:true,masterRedisPersisted:false,masterRedisTransferredToDriver:false,nativeLedgersInitialized:false,accountsCreated:0,deployments:0,syntheticFixtures:true,...zero};
 await writeReceipt('docs/evidence/recovery-example-budget-local-access-'+(action==='acl'?'acl':'acl-recovered')+'-2026-10-12.json',result);return result;
}
export async function runApprovedLocalMeasurement(approvedHash,{journal=localAccessJournal(),checkOld=preservePrevious,writeIntent=exclusive,writeReceipt=publicReceipt,executeDriver=spawnMeasurementDriver}={}){
 const j=await journal.read();if(j?.phase!=='access-ready'||!hex.test(approvedHash??''))fail('LOCAL_APPROVED_READY_MEASUREMENT_ACCESS_REQUIRED');
 const driverBytes=await readFile(LOCAL_ACCESS.driver);if(driverBytes.length>524288||sha(driverBytes)!==approvedHash)fail('LOCAL_EXACT_REVIEWED_MEASUREMENT_DRIVER_REQUIRED');
 validateLocalMeasurementProfile(j.profile);await checkOld(j);
 await writeIntent(LOCAL_ACCESS.driverIntent,{version:1,phase:'measurement-started',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),startedAt:new Date().toISOString(),syntheticFixtures:true,sourcePublished:false,...zero});
 j.phase='measurement-started';await journal.write(j);
 const result=await executeDriver(j.profile,approvedHash);await checkOld(j);
 if(!result||typeof result!=='object'||Array.isArray(result)||JSON.stringify(result).length>131072||!String(result.status).startsWith('PASS'))fail('LOCAL_PUBLIC_MEASUREMENT_RESULT_BOUND');
 const secrets=[j.profile.token,j.profile.workerWakeToken,j.profile.providerToken,j.profile.storeKey,j.profile.operator,j.profile.reviewSecret,...Object.values(j.profile.actors).flatMap(value=>[value.bootstrap,value.human,value.agent])];
 if(secrets.some(secret=>JSON.stringify(result).includes(secret)))fail('LOCAL_PRIVATE_VALUE_IN_MEASUREMENT_REPORT');
 if(result.externalPayments!==undefined&&result.externalPayments!==0||result.realPayments!==undefined&&result.realPayments!==0||result.productionWrites!==undefined&&result.productionWrites!==0)fail('LOCAL_MEASUREMENT_FINANCIAL_SCOPE_CHANGED');
 j.phase='measured';j.measuredAt=new Date().toISOString();j.driverSha256=approvedHash;await journal.write(j);
 const receipt={status:'PASS_PRIVATE_LOCAL_MEASUREMENT_DRIVER_COMPLETED',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),measurementResult:result,previousPreviewProfileUnchanged:true,originalFinancialJournalUnchanged:true,syntheticFixtures:true,masterRedisTransferredToDriver:false,deployments:0,...zero};
 await writeReceipt('docs/evidence/recovery-example-budget-local-access-measurement-2026-10-12.json',receipt);return receipt;
}
export async function runApprovedImportFixedLocalMeasurement(approvedHash,{journal=localAccessJournal(),checkOld=preservePrevious,writeIntent=exclusive,writeReceipt=publicReceipt,executeDriver=spawnMeasurementDriver,readPrior=readEmptyImportFailure}={}){
 const j=await journal.read();if(j?.phase!=='measurement-started'||!hex.test(approvedHash??''))fail('LOCAL_EXPLICIT_IMPORT_FIX_PHASE_REQUIRED');
 const driverBytes=await readFile(LOCAL_ACCESS.driver);if(driverBytes.length>524288||sha(driverBytes)!==approvedHash)fail('LOCAL_EXACT_REVIEWED_MEASUREMENT_DRIVER_REQUIRED');
 validateLocalMeasurementProfile(j.profile);await checkOld(j);const prior=await readPrior(j.profile);
 await writeIntent('.vercel/recovery-example-budget-local-measurement-import-fixed-intent.json',{version:1,phase:'measurement-import-fixed-started',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),startedAt:new Date().toISOString(),prior,syntheticFixtures:true,sourcePublished:false,...zero});
 j.phase='measurement-import-fixed-started';await journal.write(j);
 const result=await executeDriver(j.profile,approvedHash,'run-import-fixed');await checkOld(j);
 validatePublicMeasurementResult(result,j.profile);
 j.phase='measured';j.measuredAt=new Date().toISOString();j.driverSha256=approvedHash;j.explicitImportOnlyRestart=prior;await journal.write(j);
 const receipt={status:'PASS_PRIVATE_LOCAL_IMPORT_FIXED_MEASUREMENT_DRIVER_COMPLETED',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),measurementResult:result,explicitImportOnlyRestart:prior,previousPreviewProfileUnchanged:true,originalFinancialJournalUnchanged:true,syntheticFixtures:true,masterRedisTransferredToDriver:false,deployments:0,...zero};
 await writeReceipt('docs/evidence/recovery-example-budget-local-access-measurement-import-fixed-2026-10-12.json',receipt);return receipt;
}
export async function runApprovedTransportFixedLocalMeasurement(approvedHash,{journal=localAccessJournal(),checkOld=preservePrevious,writeIntent=exclusive,writeReceipt=publicReceipt,executeDriver=spawnMeasurementDriver,readPrior=readTransportSetupFailure}={}){
 const j=await journal.read();if(j?.phase!=='measurement-import-fixed-started'||!hex.test(approvedHash??''))fail('LOCAL_EXPLICIT_TRANSPORT_FIX_PHASE_REQUIRED');
 const driverBytes=await readFile(LOCAL_ACCESS.driver);if(driverBytes.length>524288||sha(driverBytes)!==approvedHash)fail('LOCAL_EXACT_REVIEWED_MEASUREMENT_DRIVER_REQUIRED');
 validateLocalMeasurementProfile(j.profile);await checkOld(j);const prior=await readPrior(j.profile);
 await writeIntent('.vercel/recovery-example-budget-local-measurement-transport-fixed-intent.json',{version:1,phase:'measurement-transport-fixed-started',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),startedAt:new Date().toISOString(),prior,syntheticFixtures:true,sourcePublished:false,accountsRecreated:false,ledgersReset:false,...zero});
 j.phase='measurement-transport-fixed-started';await journal.write(j);
 const result=await executeDriver(j.profile,approvedHash,'run-transport-fixed');await checkOld(j);validatePublicMeasurementResult(result,j.profile);
 j.phase='measured';j.measuredAt=new Date().toISOString();j.driverSha256=approvedHash;j.explicitTransportOnlyRestart=prior;await journal.write(j);
 const receipt={status:'PASS_PRIVATE_LOCAL_TRANSPORT_FIXED_MEASUREMENT_DRIVER_COMPLETED',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),measurementResult:result,explicitTransportOnlyRestart:prior,previousPreviewProfileUnchanged:true,originalFinancialJournalUnchanged:true,syntheticFixtures:true,masterRedisTransferredToDriver:false,accountsRecreated:false,ledgersReset:false,deployments:0,...zero};
 await writeReceipt('docs/evidence/recovery-example-budget-local-access-measurement-transport-fixed-2026-10-13.json',receipt);return receipt;
}
export async function runApprovedMcpSerializedLocalMeasurement(approvedHash,{journal=localAccessJournal(),checkOld=preservePrevious,writeIntent=exclusive,writeReceipt=publicReceipt,executeDriver=spawnMeasurementDriver,readPrior=readMcpDiscoveryFailure}={}){
 const j=await journal.read();if(j?.phase!=='measurement-transport-fixed-started'||!hex.test(approvedHash??''))fail('LOCAL_EXPLICIT_MCP_SERIALIZATION_PHASE_REQUIRED');
 const driverBytes=await readFile(LOCAL_ACCESS.driver);if(driverBytes.length>524288||sha(driverBytes)!==approvedHash)fail('LOCAL_EXACT_REVIEWED_MEASUREMENT_DRIVER_REQUIRED');
 validateLocalMeasurementProfile(j.profile);await checkOld(j);const prior=await readPrior(j.profile);
 await writeIntent('.vercel/recovery-example-budget-local-measurement-mcp-serialized-intent.json',{version:1,phase:'measurement-mcp-serialized-started',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),startedAt:new Date().toISOString(),prior,syntheticFixtures:true,sourcePublished:false,accountsRecreated:false,publicationRepeated:false,ledgersReset:false,...zero});
 j.phase='measurement-mcp-serialized-started';await journal.write(j);
 const result=await executeDriver(j.profile,approvedHash,'run-mcp-serialized');await checkOld(j);validatePublicMeasurementResult(result,j.profile);
 j.phase='measured';j.measuredAt=new Date().toISOString();j.driverSha256=approvedHash;j.explicitMcpSerializationContinuation=prior;await journal.write(j);
 const receipt={status:'PASS_PRIVATE_LOCAL_MCP_SERIALIZED_MEASUREMENT_DRIVER_COMPLETED',driverPath:LOCAL_ACCESS.driver,driverSha256:approvedHash,familyFingerprint:sha(j.profile.family),measurementResult:result,explicitMcpSerializationContinuation:prior,previousPreviewProfileUnchanged:true,originalFinancialJournalUnchanged:true,syntheticFixtures:true,masterRedisTransferredToDriver:false,accountsRecreated:false,publicationRepeated:false,ledgersReset:false,deployments:0,...zero};
 await writeReceipt('docs/evidence/recovery-example-budget-local-access-measurement-mcp-serialized-2026-10-13.json',receipt);return receipt;
}
export function validatePublicMeasurementResult(result,profile){
 if(!result||typeof result!=='object'||Array.isArray(result)||JSON.stringify(result).length>131072||!String(result.status).startsWith('PASS'))fail('LOCAL_PUBLIC_MEASUREMENT_RESULT_BOUND');
 const secrets=[profile.token,profile.workerWakeToken,profile.providerToken,profile.storeKey,profile.operator,profile.reviewSecret,...Object.values(profile.actors).flatMap(value=>[value.bootstrap,value.human,value.agent])];
 if(secrets.some(secret=>JSON.stringify(result).includes(secret)))fail('LOCAL_PRIVATE_VALUE_IN_MEASUREMENT_REPORT');
 if(result.externalPayments!==undefined&&result.externalPayments!==0||result.realPayments!==undefined&&result.realPayments!==0||result.productionWrites!==undefined&&result.productionWrites!==0)fail('LOCAL_MEASUREMENT_FINANCIAL_SCOPE_CHANGED');
}
export async function readEmptyImportFailure(profile){
 const paths=[LOCAL_ACCESS.driverIntent,'.vercel/recovery-example-native-local-measurement-intent.json','docs/evidence/recovery-example-native-local-measurement-2026-10-13.json'];const raws=[];
 for(const path of paths){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>2097152)fail('LOCAL_BOUNDED_ZERO_EFFECT_IMPORT_RECEIPTS_REQUIRED');raws.push(await readFile(path));}
 validateEmptyImportArtifacts(profile,...raws.map(bytes=>JSON.parse(bytes)));const familyFingerprint=sha(profile.family);
 return {previousHelperIntentSha256:sha(raws[0]),previousDriverIntentSha256:sha(raws[1]),previousFailureReceiptSha256:sha(raws[2]),familyFingerprint,previousEffects:0,previousArtifactsPreserved:true};
}
export function validateEmptyImportArtifacts(profile,helperIntent,driverIntent,receipt){
 const familyFingerprint=sha(profile.family);
 if(helperIntent.phase!=='measurement-started'||helperIntent.driverPath!==LOCAL_ACCESS.driver||helperIntent.familyFingerprint!==familyFingerprint||driverIntent.status!=='ONE_SYNTHETIC_LOCAL_NATIVE_MEASUREMENT_INTENT'||driverIntent.familyFingerprint!==familyFingerprint||receipt.status!=='UNCONFIRMED_REAL_REDIS_LOCAL_NATIVE_EXAMPLE_FLOW'||receipt.familyFingerprint!==familyFingerprint||receipt.lastStage!=='native-setup'||receipt.realRedis?.restRequests!==0||receipt.realRedis?.combinedBodyBytes!==0||receipt.applicationRequests!==0||receipt.syntheticSignatures!==0||receipt.syntheticFacilitator?.verifyCalls!==0||receipt.syntheticFacilitator?.settleCalls!==0||receipt.syntheticFacilitator?.rpcCalls!==0||receipt.providerExecutions!==0||receipt.realPayments!==0||receipt.realWalletSignatures!==0||receipt.secretValuesReturned!==0)fail('LOCAL_ZERO_EFFECT_IMPORT_FAILURE_REQUIRED');
 return true;
}
export function validateTransportSetupArtifacts(profile,helperIntent,driverIntent,receipt){
 const familyFingerprint=sha(profile.family),phases=receipt?.requestPhaseMatrix;
 const creation=phases?.find(row=>row.route==='/api/workspaces'),permissions=phases?.find(row=>row.route==='/api/market/agent-permissions');
 if(helperIntent.phase!=='measurement-import-fixed-started'||helperIntent.driverPath!==LOCAL_ACCESS.driver||helperIntent.familyFingerprint!==familyFingerprint||driverIntent.status!=='ONE_SYNTHETIC_LOCAL_NATIVE_MEASUREMENT_INTENT'||driverIntent.familyFingerprint!==familyFingerprint||receipt.status!=='UNCONFIRMED_REAL_REDIS_LOCAL_NATIVE_EXAMPLE_FLOW'||receipt.familyFingerprint!==familyFingerprint||receipt.lastStage!=='native-setup'||receipt.realRedis?.restRequests!==26||receipt.realRedis?.combinedBodyBytes!==59845||receipt.applicationRequests!==3||!Array.isArray(phases)||phases.length!==2||creation?.stage!=='native-setup'||creation.method!=='POST'||creation.requests!==2||JSON.stringify(creation.statusCounts)!=='{"201":2}'||permissions?.stage!=='native-setup'||permissions.method!=='POST'||permissions.requests!==1||JSON.stringify(permissions.statusCounts)!=='{"503":1}'||receipt.lastNativeFailure?.stage!=='native-setup'||receipt.lastNativeFailure.status!==503||receipt.lastNativeFailure.code!=='FREE_DEMO_BUDGET_UNAVAILABLE'||receipt.syntheticSignatures!==0||receipt.syntheticFacilitator?.verifyCalls!==0||receipt.syntheticFacilitator?.settleCalls!==0||receipt.syntheticFacilitator?.rpcCalls!==0||receipt.providerExecutions!==0||receipt.realPayments!==0||receipt.realWalletSignatures!==0||receipt.secretValuesReturned!==0)fail('LOCAL_EXACT_PERMISSIONS_TRANSPORT_FAILURE_REQUIRED');
 return true;
}
export async function readTransportSetupFailure(profile){
 const paths=['.vercel/recovery-example-budget-local-measurement-import-fixed-intent.json','.vercel/recovery-example-native-local-measurement-import-fixed-intent.json','docs/evidence/recovery-example-native-local-measurement-import-fixed-2026-10-13.json'];const raws=[];
 for(const path of paths){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>2097152)fail('LOCAL_BOUNDED_TRANSPORT_FAILURE_RECEIPTS_REQUIRED');raws.push(await readFile(path));}
 validateTransportSetupArtifacts(profile,...raws.map(bytes=>JSON.parse(bytes)));
 return {previousHelperIntentSha256:sha(raws[0]),previousDriverIntentSha256:sha(raws[1]),previousFailureReceiptSha256:sha(raws[2]),familyFingerprint:sha(profile.family),previousRedisRequests:26,previousRedisBodyBytes:59845,existingActorCreations:2,previousPayments:0,previousExecutions:0,previousArtifactsPreserved:true};
}
export function validateMcpDiscoveryArtifacts(profile,helperIntent,driverIntent,receipt){
 const familyFingerprint=sha(profile.family),matrix=receipt?.requestPhaseMatrix;
 const match=(stage,route,method,tool,status,requests)=>{const found=matrix?.filter(row=>row.stage===stage&&row.route===route&&row.method===method&&row.tool===tool);return found?.length===1&&found[0].requests===requests&&JSON.stringify(found[0].statusCounts)===JSON.stringify({[status]:requests});};
 if(helperIntent.phase!=='measurement-transport-fixed-started'||helperIntent.driverPath!==LOCAL_ACCESS.driver||helperIntent.familyFingerprint!==familyFingerprint||driverIntent.status!=='ONE_SYNTHETIC_LOCAL_NATIVE_MEASUREMENT_INTENT'||driverIntent.familyFingerprint!==familyFingerprint||receipt.status!=='UNCONFIRMED_REAL_REDIS_LOCAL_NATIVE_EXAMPLE_FLOW'||receipt.familyFingerprint!==familyFingerprint||receipt.lastStage!=='buyer-mcp-discovery'||receipt.realRedis?.restRequests!==88||receipt.realRedis?.combinedBodyBytes!==379330||receipt.applicationRequests!==8||!Array.isArray(matrix)||matrix.length!==7||!match('native-setup','/api/market/agent-permissions','POST',undefined,200,1)||!match('native-setup','/api/market/services','POST',undefined,201,1)||!match('native-setup','/api/market/review','POST',undefined,200,2)||!match('buyer-mcp-discovery','/api/mcp','POST','initialize',200,1)||!match('buyer-mcp-discovery','/api/mcp','POST','notifications/initialized',202,1)||!match('buyer-mcp-discovery','/api/mcp','GET',undefined,405,1)||!match('buyer-mcp-discovery','/api/mcp','POST','get_bazaar_identity',503,1)||receipt.lastNativeFailure?.stage!=='buyer-mcp-discovery'||receipt.lastNativeFailure.status!==503||receipt.lastNativeFailure.code!=='WORKSPACE_UNAVAILABLE'||receipt.syntheticSignatures!==0||receipt.syntheticFacilitator?.verifyCalls!==0||receipt.syntheticFacilitator?.settleCalls!==0||receipt.syntheticFacilitator?.rpcCalls!==0||receipt.providerExecutions!==0||receipt.realPayments!==0||receipt.realWalletSignatures!==0||receipt.secretValuesReturned!==0)fail('LOCAL_EXACT_MCP_DISCOVERY_CONTENTION_REQUIRED');
 return true;
}
export async function readMcpDiscoveryFailure(profile){
 const paths=['.vercel/recovery-example-budget-local-measurement-transport-fixed-intent.json','.vercel/recovery-example-native-local-measurement-transport-fixed-intent.json','docs/evidence/recovery-example-native-local-measurement-transport-fixed-2026-10-13.json'];const raws=[];
 for(const path of paths){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>2097152)fail('LOCAL_BOUNDED_MCP_DISCOVERY_RECEIPTS_REQUIRED');raws.push(await readFile(path));}
 validateMcpDiscoveryArtifacts(profile,...raws.map(bytes=>JSON.parse(bytes)));
 return {previousHelperIntentSha256:sha(raws[0]),previousDriverIntentSha256:sha(raws[1]),previousFailureReceiptSha256:sha(raws[2]),familyFingerprint:sha(profile.family),previousRedisRequests:88,previousRedisBodyBytes:379330,existingAccountsAndPublicationRetained:true,existingWorkerAndRuntimeLedgersRetained:true,previousPayments:0,previousExecutions:0,previousArtifactsPreserved:true};
}
export async function spawnMeasurementDriver(profile,approvedHash,action='run'){
 if(!['run','run-import-fixed','run-transport-fixed','run-mcp-serialized'].includes(action))fail('LOCAL_FIXED_DRIVER_ACTION_REQUIRED');
 const env={NODE_ENV:'test'};for(const name of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[name])env[name]=process.env[name];
 return await new Promise((done,reject)=>{
  const child=spawn(process.execPath,['--experimental-strip-types',LOCAL_ACCESS.driver,action,'--approved-helper-sha256',approvedHash],{cwd:process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe'],env});
  const chunks=[];let n=0,settled=false;const finish=(bad,value)=>{if(settled)return;settled=true;clearTimeout(timer);bad?reject(Error('LOCAL_MEASUREMENT_ACK_UNCONFIRMED_RECOVERY_ONLY')):done(value);};
  const timer=setTimeout(()=>{child.kill();finish(true);},180000);child.stderr.resume();child.stdout.on('data',bytes=>{n+=bytes.length;if(n>131072){child.kill();finish(true);}else chunks.push(bytes);});child.on('error',()=>finish(true));child.on('close',code=>{try{if(code!==0)throw Error();const raw=Buffer.concat(chunks).toString();const value=JSON.parse(raw);finish(false,value);}catch{finish(true);}});
  const encoded=Buffer.from(JSON.stringify(profile));child.stdin.end(encoded,()=>encoded.fill(0));
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const[action,flag,approvedHash]=process.argv.slice(2);let result;if(['measure','measure-import-fixed','measure-transport-fixed','measure-mcp-serialized'].includes(action)){if(process.argv.length!==5||flag!=='--approved-helper-sha256')fail('LOCAL_EXPLICIT_REVIEWED_DRIVER_REQUIRED');result=await (action==='measure'?runApprovedLocalMeasurement:action==='measure-import-fixed'?runApprovedImportFixedLocalMeasurement:action==='measure-transport-fixed'?runApprovedTransportFixedLocalMeasurement:runApprovedMcpSerializedLocalMeasurement)(approvedHash);}else{if(process.argv.length!==3)fail('LOCAL_ACCESS_ACTION_REQUIRED');result=await runLocalAccess(action,await privateInput());}console.log(JSON.stringify({...result,...zero}));}
 catch(error){console.log(JSON.stringify({status:'UNCONFIRMED',code:safeCode(error),...zero}));process.exitCode=1;}
}
