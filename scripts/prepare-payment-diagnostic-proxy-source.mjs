// Freeze only the locally reviewed proxy/handler diagnostic correction.
import {lstat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
import {readPlainOnDemandSource} from './prepare-on-demand-v2-sources.mjs';
const root=process.cwd(),sha=b=>createHash('sha256').update(b).digest('hex');
const basePath='docs/evidence/payment-diagnostic-origin-bazaar-production-source-2026-10-12.json',baseSha='e984025ee50cf970ded769a86cb6a98318ad6f2d090c2ea13f196f1e2e9c9948';
const paths=['lib/market-operator-diagnostic-origin.ts','lib/marketplace-http.ts','lib/operational-route-gate.ts'];
const directory='.vercel/payment-diagnostic-proxy-bazaar-production-source',manifestPath='docs/evidence/payment-diagnostic-proxy-bazaar-production-source-2026-10-12.json';
try{
 if(process.argv.length!==2)throw Error('OFFLINE_SOURCE_HAS_NO_PRIVATE_ARGUMENTS');
 const raw=await readPlainOnDemandSource(root,basePath);if(sha(raw)!==baseSha)throw Error('PREVIOUS_ORIGIN_SOURCE_CHANGED');
 const base=JSON.parse(raw),buffers=new Map();
 if(base.sourceDigest!=='1f7003e09c59590cd6f332704dd369efe0775ad4d39ebcb74ea2bcead8c1520a'||base.files.length!==343)throw Error('EXACT_ORIGIN_SOURCE_REQUIRED');
 for(const f of base.files){if(!safeSourcePath(f.path))throw Error('PLAIN_REVIEWED_SOURCE_REQUIRED');const b=await readPlainOnDemandSource(root,base.sourceDirectory+'/'+f.path);if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('PREVIOUS_ORIGIN_BYTES_CHANGED');buffers.set(f.path,b);}
 for(const path of paths){if(!safeSourcePath(path))throw Error('PLAIN_PROXY_CORRECTION_REQUIRED');const next=await readPlainOnDemandSource(root,path);if(buffers.get(path)?.equals(next))throw Error('REVIEWED_PROXY_CORRECTION_REQUIRED');buffers.set(path,next);}
 try{await lstat(resolve(root,directory));throw Error('NEW_IMMUTABLE_PROXY_SOURCE_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}
 const files=[...buffers].map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})).sort((a,b)=>a.path.localeCompare(b.path));
 if(files.length!==344)throw Error('EXACT_PROXY_SOURCE_INVENTORY_REQUIRED');
 const manifest={version:1,status:'FROZEN_LOCAL_PAYMENT_DIAGNOSTIC_PROXY_NOT_DEPLOYED',candidate:'payment-diagnostic-proxy-bazaar-2026-10-12',sourceDirectory:directory,sourceDigest:sourceDigest(files),parentSourceDigest:base.sourceDigest,parentManifestSha256:baseSha,changedPaths:paths,files,providerUnchanged:true,productionPublished:false,newPayments:0,cronActivated:false,networkRequests:0,dpapiReads:0};
 for(const [p,b]of buffers){const out=resolve(root,directory,p);await mkdir(dirname(out),{recursive:true});await writeFile(out,b,{flag:'wx'});}
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(resolve(root,manifestPath),bytes,{flag:'wx'});
 console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,manifestSha256:sha(bytes),files:files.length,changedPaths:paths,manifestPath,newPayments:0,productionPublished:false,networkRequests:0}));
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_OFFLINE_PROXY_SOURCE',code:/^[A-Z_]{3,90}$/.test(e.message??'')?e.message:'OFFLINE_SOURCE_UNCONFIRMED',newPayments:0,productionPublished:false,networkRequests:0}));process.exitCode=1;}
