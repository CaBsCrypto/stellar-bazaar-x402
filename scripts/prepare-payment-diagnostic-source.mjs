// Offline candidate only: exact accepted source plus five explicit runtime paths.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
import {readPlainOnDemandSource} from './prepare-on-demand-v2-sources.mjs';
const root=process.cwd(),sha=b=>createHash('sha256').update(b).digest('hex'),basePath='docs/evidence/continuous-on-demand-v4-bazaar-production-source-2026-10-12.json',baseSha='645be4b77cbc04c035d603b4160e1a03e1974bf02576ec1ca5cf2b16f5d1b976';
const paths=['lib/marketplace-x402.ts','lib/marketplace-x402-store.ts','lib/marketplace-capacity.ts','lib/marketplace-http.ts','lib/market-facilitator-health.ts'],directory='.vercel/payment-diagnostic-bazaar-production-source',manifestPath='docs/evidence/payment-diagnostic-bazaar-production-source-2026-10-12.json';
try{
 if(process.argv.length!==2)throw Error('OFFLINE_SOURCE_HAS_NO_PRIVATE_ARGUMENTS');
 const raw=await readPlainOnDemandSource(root,basePath);if(sha(raw)!==baseSha)throw Error('ACCEPTED_SOURCE_MANIFEST_CHANGED');const base=JSON.parse(raw),buffers=new Map();
 if(base.sourceDigest!=='2358527b4f1e5947c296e3e7fb01af2a3345616a765fc8de468719f0ad49cf86'||base.files.length!==342)throw Error('EXACT_CURRENT_PRODUCTION_SOURCE_REQUIRED');
 for(const f of base.files){if(!safeSourcePath(f.path))throw Error('PLAIN_REVIEWED_SOURCE_REQUIRED');const b=await readPlainOnDemandSource(root,base.sourceDirectory+'/'+f.path);if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('ACCEPTED_SOURCE_BYTES_CHANGED');buffers.set(f.path,b);}
 const changed=[];for(const p of paths){const b=await readPlainOnDemandSource(root,p),prior=buffers.get(p);if(!prior||!prior.equals(b))changed.push(p);buffers.set(p,b);}if(changed.length!==5)throw Error('EXACT_FIVE_PATH_DIAGNOSTIC_CANDIDATE_REQUIRED');
 try{await lstat(resolve(root,directory));throw Error('NEW_IMMUTABLE_DIAGNOSTIC_SOURCE_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}
 const files=[...buffers].map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})).sort((a,b)=>a.path.localeCompare(b.path));
 const manifest={version:1,status:'FROZEN_LOCAL_PAYMENT_DIAGNOSTIC_NOT_DEPLOYED',candidate:'payment-diagnostic-bazaar-2026-10-12',sourceDirectory:directory,sourceDigest:sourceDigest(files),parentSourceDigest:base.sourceDigest,parentManifestSha256:baseSha,changedPaths:changed,files,providerUnchanged:true,productionPublished:false,newPayments:0,cronActivated:false,networkRequests:0,dpapiReads:0};
 for(const [p,b]of buffers){const out=resolve(root,directory,p);await mkdir(dirname(out),{recursive:true});await writeFile(out,b,{flag:'wx'});}
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(resolve(root,manifestPath),bytes,{flag:'wx'});console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,manifestSha256:sha(bytes),files:files.length,changedPaths:changed,manifestPath,newPayments:0,productionPublished:false,networkRequests:0}));
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_OFFLINE_DIAGNOSTIC_SOURCE',code:/^[A-Z_]{3,90}$/.test(e.message??'')?e.message:'OFFLINE_SOURCE_UNCONFIRMED',newPayments:0,productionPublished:false,networkRequests:0}));process.exitCode=1;}
