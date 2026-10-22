import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const CONTINUOUS_PROVIDER_RUNTIME_FILES=Object.freeze(['seller-hosted-handler.mjs','seller-hosted-tick.mjs','seller-redis-secret-store.mjs','seller-mcp-transport.mjs','seller-http-adapter.mjs','seller-service-card.mjs','seller-marketplace-worker.mjs','private-mcp-client.mjs','market-price.mjs']);
export const CONTINUOUS_PROVIDER_FROZEN_FILES=Object.freeze(['src/types.ts','src/preview-app.ts','src/marketplace-text.ts','src/marketplace-routes.ts','src/engine/wpm-calculator.ts','src/engine/algorithmic-script-generator.ts','server.ts','seller/seller-hosted-handler.d.mts','package.json','package-lock.json','tsconfig.json','vercel.json','.vercelignore']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const contained=(root,path)=>{const part=relative(root,path);return part!==''&&!part.startsWith('..')&&!isAbsolute(part);};
async function regular(root,path,directory=false){
 if(path!==root&&!contained(root,path))throw Error('WORKSPACE_PATH_REQUIRED');
 const parts=[];let cursor=path;while(cursor!==root){parts.push(cursor);cursor=dirname(cursor);}parts.push(root);
 for(const [index,part]of parts.reverse().entries()){const info=await lstat(part);if(info.isSymbolicLink()||!(index===parts.length-1&&!directory?info.isFile():info.isDirectory()))throw Error('REGULAR_WORKSPACE_PATH_REQUIRED');}
}
/** New local package only. Read exactly 22 public inputs; do not recurse through
 * the frozen tree's node_modules, build output, Vercel link or private profiles.
 * Preview is always unscheduled; a production schedule is metadata for review.
 */
export async function prepareContinuousProviderPreview({repo,source,destination,evidencePath}){
 const root=resolve(repo),workspace=dirname(root),frozen=resolve(source),target=resolve(destination),evidence=resolve(evidencePath);
 if(!contained(workspace,frozen)||!contained(workspace,target)||target===root||target===frozen||contained(frozen,target)||!contained(root,evidence)||!evidence.endsWith('.json'))throw Error('NEW_OWNED_PATH_REQUIRED');
 await regular(workspace,root,true);await regular(workspace,frozen,true);await regular(workspace,dirname(target),true);await regular(workspace,dirname(evidence),true);
 for(const path of [target,evidence])try{await lstat(path);throw Error('NEW_DESTINATION_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
 const frozenInputs=[],currentInputs=[];
 for(const name of CONTINUOUS_PROVIDER_FROZEN_FILES){const path=join(frozen,name);await regular(workspace,path);frozenInputs.push({path:name,bytes:await readFile(path)});}
 for(const name of CONTINUOUS_PROVIDER_RUNTIME_FILES){const priorPath=join(frozen,'seller',name),path=join(root,'examples',name);await regular(workspace,priorPath);await regular(workspace,path);frozenInputs.push({path:'seller/'+name,bytes:await readFile(priorPath)});currentInputs.push({path:'seller/'+name,bytes:await readFile(path)});}
 const frozenMap=new Map(frozenInputs.map(entry=>[entry.path,entry])),pkg=JSON.parse(frozenMap.get('package.json').bytes),lock=JSON.parse(frozenMap.get('package-lock.json').bytes);
 if(pkg.name!=='ai-video-scriptwriter'||!pkg.private||pkg.type!=='module'||pkg.engines?.node!=='24.x'||pkg.dependencies?.['@modelcontextprotocol/sdk']!=='1.30.0'||pkg.dependencies?.['@stellar/stellar-sdk']!=='14.4.2'||JSON.stringify(Object.entries(pkg.dependencies).sort())!==JSON.stringify(Object.entries(lock.packages?.['']?.dependencies??{}).sort()))throw Error('PINNED_PROVIDER_LOCK_REQUIRED');
 const config=JSON.parse(frozenMap.get('vercel.json').bytes);if(config.functions?.['server.ts']?.maxDuration!==60)throw Error('BOUNDED_PROVIDER_REQUIRED');config.crons=[];
 const files=[...frozenInputs.filter(entry=>CONTINUOUS_PROVIDER_FROZEN_FILES.includes(entry.path)),...currentInputs].map(entry=>entry.path==='vercel.json'?{...entry,bytes:Buffer.from(JSON.stringify(config,null,2)+'\n')}:entry).sort((a,b)=>a.path.localeCompare(b.path));
 const names=new Set(files.map(entry=>entry.path));if(files.length!==22||names.size!==22)throw Error('EXACT_PUBLIC_SOURCE_ALLOWLIST_REQUIRED');
 for(const entry of files){
  if(/(?:^|\/)(?:\.env|\.vercel|\.git|node_modules|dist|test|tests|fixtures)(?:\.|\/|$)/i.test(entry.path)||/\.(?:dpapi|pem|key|pfx|p12|log)$/i.test(entry.path))throw Error('PRIVATE_SOURCE_FORBIDDEN');
  if(/\.(?:mjs|ts)$/.test(entry.path)){
   const text=entry.bytes.toString('utf8');if(/\bimport\s*\(/.test(text))throw Error('DYNAMIC_RUNTIME_IMPORT_FORBIDDEN');
   for(const match of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g))if(match[1].startsWith('.')){const name=relative(target,resolve(target,dirname(entry.path),match[1])).replaceAll('\\','/').replace(/\.js$/,'.ts');if(!names.has(name))throw Error('PUBLIC_RUNTIME_DEPENDENCY_MISSING');}
  }
 }
 const ignore=frozenMap.get('.vercelignore').bytes.toString('utf8').split(/\r?\n/);for(const rule of ['**/.env','**/.env.*','**/.vercel','**/.git','**/node_modules','**/dist','**/*.dpapi','**/*secrets*.json','**/*credentials*.json'])if(!ignore.includes(rule))throw Error('DEPLOYMENT_EXCLUSIONS_REQUIRED');
 await mkdir(target);
 for(const entry of files){const path=join(target,entry.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,entry.bytes,{flag:'wx'});}
 const inventory=entries=>entries.map(entry=>({path:entry.path,sha256:sha(entry.bytes),bytes:entry.bytes.length})).sort((a,b)=>a.path.localeCompare(b.path));
 const manifestFiles=inventory(files),baseFiles=inventory(frozenInputs);
 const manifest={version:1,status:'PREPARED_LOCAL_NO_CRON',preparedAt:new Date().toISOString(),sourceDirectory:relative(root,target).replaceAll('\\','/'),baseSourceDirectory:relative(root,frozen).replaceAll('\\','/'),baseSourceDigest:sha(JSON.stringify(baseFiles)),sourceDigest:sha(JSON.stringify(manifestFiles)),runtimeFiles:CONTINUOUS_PROVIDER_RUNTIME_FILES.length,files:manifestFiles,changedFromFrozen:manifestFiles.filter(entry=>entry.sha256!==baseFiles.find(prior=>prior.path===entry.path)?.sha256).map(entry=>entry.path),cronSchedules:[],proposedProductionCron:{path:'/api/bazaar/seller/tick',schedule:'*/2 * * * *',activation:'NOT_APPLIED'},credentialsCopied:false,privateFilesRead:false,secretDecryption:false,tickInvocations:0,payments:0,deployments:0,productionPublished:false};
 await writeFile(evidence,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [destination,evidencePath]=process.argv.slice(2);if(!destination||!evidencePath||process.argv.length!==4)throw Error('Use: prepare-continuous-provider-preview.mjs <new-local-stage> <new-public-manifest.json>');
 const manifest=await prepareContinuousProviderPreview({repo:process.cwd(),source:resolve('.vercel/text-production-provider-source'),destination:resolve(destination),evidencePath:resolve(evidencePath)});
 console.log(JSON.stringify({status:manifest.status,files:manifest.files.length,sourceDirectory:manifest.sourceDirectory,sourceDigest:manifest.sourceDigest,changedFromFrozen:manifest.changedFromFrozen,cronSchedules:[],proposedProductionCron:manifest.proposedProductionCron,credentialsCopied:false,privateFilesRead:false,deployments:0}));
}
