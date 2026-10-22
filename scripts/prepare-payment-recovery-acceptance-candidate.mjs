// Offline only: overlay eight reviewed files on the exact deployed d558 source.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
const ROOT='C:/Users/MGC/Documents/ChatGPT/Bazaarx402/beta-open-build';
const BASE='docs/evidence/payment-diagnostic-authenticated-bazaar-production-source-2026-10-12.json';
const BASE_SHA='21bfd9f24f4e75bdd1ab31ac8df073e25c15e822d27165de83af42093e6eeb4e';
const SOURCE='.vercel/payment-recovery-acceptance-bazaar-source-v2';
const BUILD='.vercel/payment-recovery-acceptance-bazaar-local-build-v4';
const MANIFEST='docs/evidence/payment-recovery-acceptance-bazaar-source-v2-2026-10-12.json';
const BUILD_REPORT='docs/evidence/payment-recovery-acceptance-bazaar-build-v4-2026-10-12.json';
const OVERLAYS=['lib/marketplace-x402.ts','lib/market-seller-capacity.ts','lib/continuous-free-budget.ts','lib/operational-pressure.ts','lib/marketplace-capacity.ts','lib/marketplace-store.ts','lib/market-guardian.ts','lib/demo-instructions.ts'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=()=>{throw Error('EXACT_OFFLINE_RECOVERY_CANDIDATE_REQUIRED');};
async function absent(path){try{await lstat(resolve(ROOT,path));fail();}catch(e){if(e.code!=='ENOENT')throw e;}}
async function ownPlain(dir,path){if(!safeSourcePath(path))fail();let current=resolve(ROOT,dir);for(const part of path.split('/')){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())fail();}return readFile(current);}
async function copyFile(dir,path,bytes){const target=resolve(ROOT,dir,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
async function prepare(...pins){
 if(pins.length!==OVERLAYS.length||pins.some(v=>!/^[a-f0-9]{64}$/.test(v??'')))fail();
 await absent(SOURCE);await absent(MANIFEST);
 const baseBytes=await readFile(resolve(ROOT,BASE)),base=JSON.parse(baseBytes);
 if(sha(baseBytes)!==BASE_SHA||base.sourceDigest!=='d558ae14b168fa99d10c37b9045c434b400f0c7b8abec1371248578bebe5705d'||base.sourceDirectory!=='.vercel/payment-diagnostic-authenticated-bazaar-production-source'||base.files.length!==344||sourceDigest(base.files)!==base.sourceDigest)fail();
 const overlayPins=Object.fromEntries(OVERLAYS.map((p,i)=>[p,pins[i]])),files=[];
 for(const f of base.files){const original=await ownPlain(base.sourceDirectory,f.path);if(original.length!==f.bytes||sha(original)!==f.sha256)fail();const bytes=OVERLAYS.includes(f.path)?await ownPlain('',f.path):original;if(OVERLAYS.includes(f.path)&&(sha(bytes)!==overlayPins[f.path]||bytes.equals(original)))fail();await copyFile(SOURCE,f.path,bytes);files.push({path:f.path,bytes:bytes.length,sha256:sha(bytes)});}
 const manifest={version:1,status:'FROZEN_LOCAL_RECOVERY_ACCEPTANCE_CANDIDATE_NOT_DEPLOYED',sourceDirectory:SOURCE,sourceDigest:sourceDigest(files),parentSourceDigest:base.sourceDigest,parentManifestSha256:BASE_SHA,fileCount:files.length,files,changedPaths:OVERLAYS,overlayPins,recoverySlotDefault:'off',generalPurchasesRemainClosed:true,originalOperationUnchanged:true,privateEnvironmentRead:false,cloudWrites:0,newPayments:0,createdAt:new Date().toISOString()};
 await writeFile(resolve(ROOT,MANIFEST),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return {status:manifest.status,sourceDigest:manifest.sourceDigest,manifestSha256:sha(await readFile(resolve(ROOT,MANIFEST))),changedPaths:OVERLAYS,fileCount:344,manifest:MANIFEST,cloudWrites:0,newPayments:0};
}
async function build(expectedManifest){
 await absent(BUILD);await absent(BUILD_REPORT);
 const manifestBytes=await readFile(resolve(ROOT,MANIFEST)),m=JSON.parse(manifestBytes);if(sha(manifestBytes)!==expectedManifest||m.status!=='FROZEN_LOCAL_RECOVERY_ACCEPTANCE_CANDIDATE_NOT_DEPLOYED'||m.sourceDirectory!==SOURCE||m.files.length!==344||sourceDigest(m.files)!==m.sourceDigest||JSON.stringify(m.changedPaths)!==JSON.stringify(OVERLAYS))fail();
 for(const f of m.files){const bytes=await ownPlain(SOURCE,f.path);if(bytes.length!==f.bytes||sha(bytes)!==f.sha256)fail();await copyFile(BUILD,f.path,bytes);}
 if(!(await readFile(resolve(ROOT,'package-lock.json'))).equals(await readFile(resolve(ROOT,BUILD,'package-lock.json'))))fail();
 // Both Node and TypeScript resolve the pinned workspace node_modules through
 // this build directory's ancestors. No junction or permission change is needed.
 const allowed=['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ComSpec','PATHEXT','ProgramFiles','ProgramFiles(x86)'];
 const env={...Object.fromEntries(allowed.filter(k=>process.env[k]).map(k=>[k,process.env[k]])),NEXT_TELEMETRY_DISABLED:'1',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_MARKET_BUYER_ALLOWLIST_JSON:'["synthetic-local-only-owner"]',BAZAAR_MARKET_FILES_ENABLED:'false',AWS_EC2_METADATA_DISABLED:'true'};
 const startedAt=new Date().toISOString();
 const result=await new Promise(done=>{const child=spawn(process.execPath,[resolve(ROOT,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:resolve(ROOT,BUILD),windowsHide:true,env,stdio:['ignore','pipe','pipe']});let bytes=0,output='',finished=false;const finish=r=>{if(finished)return;finished=true;clearTimeout(timer);done(r);},timer=setTimeout(()=>{child.kill();finish({exitCode:null,output:'LOCAL_BUILD_TIMEOUT'});},240000);const collect=b=>{bytes+=b.length;if(bytes>2097152){child.kill();finish({exitCode:null,output:'LOCAL_BUILD_OUTPUT_BOUND'});}else output+=b;};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',()=>finish({exitCode:null,output:'LOCAL_BUILD_UNCONFIRMED'}));child.on('close',exitCode=>finish({exitCode,output:output.slice(-20000)}));});
 const report={version:1,status:result.exitCode===0?'PASS_FROZEN_RECOVERY_ACCEPTANCE_LOCAL_BUILD':'FAIL_RECOVERY_ACCEPTANCE_LOCAL_BUILD',sourceDigest:m.sourceDigest,manifestSha256:expectedManifest,changedPaths:OVERLAYS,startedAt,completedAt:new Date().toISOString(),...result,privateEnvironmentVariablesInherited:false,allowlist:'synthetic compilation only',recoverySlotFlag:'absent/off',hostedValidation:false,newPayments:0,cloudWrites:0,productionPublished:false,providerChanged:false,guardianImplementationChanged:true,guardianScheduleChanged:false};
 await writeFile(resolve(ROOT,BUILD_REPORT),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return {status:report.status,sourceDigest:m.sourceDigest,evidence:BUILD_REPORT,exitCode:result.exitCode,...(result.exitCode!==0?{diagnostic:result.output.slice(-3000)}:{})};
}
try{if(resolve(process.cwd())!==resolve(ROOT))fail();const[action,...args]=process.argv.slice(2);let report;if(action==='prepare'&&args.length===OVERLAYS.length)report=await prepare(...args);else if(action==='build'&&args.length===1&&/^[a-f0-9]{64}$/.test(args[0]))report=await build(args[0]);else fail();console.log(JSON.stringify(report));if(report.exitCode!==undefined&&report.exitCode!==0)process.exitCode=1;}
catch{console.log(JSON.stringify({status:'RECOVERY_CANDIDATE_PREPARATION_UNCONFIRMED',cloudWrites:0,newPayments:0,privateEnvironmentRead:false}));process.exitCode=1;}
