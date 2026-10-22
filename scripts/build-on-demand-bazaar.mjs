// Offline build of verified frozen bytes; never mutates the source snapshot.
import {readFile,writeFile,mkdir,symlink,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const revision=process.argv.includes('--v2')?'v2':'v1';
const {verifyOnDemandSources}=await import(revision==='v2'?'./prepare-on-demand-v2-sources.mjs':'./prepare-on-demand-sources.mjs');
const root=process.cwd(),verified=await verifyOnDemandSources(root),source=verified.outputs.find(s=>s.kind==='bazaar'&&s.environment==='preview');
const manifest=JSON.parse(await readFile(resolve(root,source.manifest),'utf8'));
const output=resolve(root,revision==='v2'?'.vercel/on-demand-v2-bazaar-local-build':'.vercel/on-demand-bazaar-local-build');
const resume=process.argv.includes('--resume-verified-copy');
if(!resume){try{await lstat(output);throw Error('NEW_BUILD_COPY_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(output);}
for(const f of manifest.files){const b=await readFile(resolve(root,source.sourceDirectory,f.path));if(b.length!==f.bytes||createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('SOURCE_BYTES_CHANGED');const p=resolve(output,f.path);if(resume){if((await readFile(p)).compare(b)!==0)throw Error('EXACT_RESUME_COPY_REQUIRED');}else{await mkdir(dirname(p),{recursive:true});await writeFile(p,b,{flag:'wx'});}}
if((await readFile(resolve(root,'package-lock.json'))).compare(await readFile(resolve(output,'package-lock.json')))!==0)throw Error('EXACT_CACHED_DEPENDENCIES_REQUIRED');
if(!resume)await symlink(resolve(root,'node_modules'),resolve(output,'node_modules'),'junction');
const startedAt=new Date().toISOString();
const result=await new Promise(resolveResult=>{
 const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:output,windowsHide:true,env:{...process.env,BAZAAR_ENABLE_MARKET_PURCHASES:'false',BAZAAR_MARKET_FILES_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 let outputText='',size=0;const timer=setTimeout(()=>child.kill(),240000);
 const collect=b=>{size+=b.length;if(size>2097152)child.kill();else outputText+=b.toString();};child.stdout.on('data',collect);child.stderr.on('data',collect);
 child.on('close',exitCode=>{clearTimeout(timer);resolveResult({exitCode,output:outputText.slice(-20000)});});child.on('error',()=>{clearTimeout(timer);resolveResult({exitCode:null,output:'BUILD_PROCESS_UNAVAILABLE'});});
});
const evidence={version:1,status:result.exitCode===0?'PASS_FROZEN_LOCAL_BUILD':'FAIL',sourceDigest:source.sourceDigest,manifestSha256:source.manifestSha256,startedAt,completedAt:new Date().toISOString(),...result,networkRequests:0,payments:0,cronActivated:false,productionPublished:false,limitations:['Hosted dependency installation and runtime acceptance remain separate checks.']};
const evidencePath=revision==='v2'?'docs/evidence/on-demand-v2-bazaar-build-2026-10-11.json':'docs/evidence/on-demand-bazaar-build-2026-10-11.json';
await writeFile(resolve(root,evidencePath),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:evidence.status,sourceDigest:source.sourceDigest,exitCode:result.exitCode,...(result.exitCode===0?{}:{diagnostic:result.output.slice(-4000)}),evidence:evidencePath}));
if(result.exitCode!==0)process.exitCode=1;
