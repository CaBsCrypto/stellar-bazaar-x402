import {readFile,writeFile,mkdir,stat,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const runtimeFiles=['seller-hosted-handler.mjs','seller-hosted-tick.mjs','seller-redis-secret-store.mjs','seller-mcp-transport.mjs','seller-http-adapter.mjs','seller-service-card.mjs','seller-marketplace-worker.mjs','private-mcp-client.mjs','market-price.mjs'];
const providerFiles=['types.ts','preview-app.ts','marketplace-text.ts','marketplace-routes.ts','engine/wpm-calculator.ts','engine/algorithmic-script-generator.ts'];

/** Local packaging only. A new directory preserves the accepted provider cut.
 * Copies source and an explicit runtime allowlist; no private profile, tests,
 * simulator, environment file, generated build or credential is transferred.
 */
export async function prepareHostedSellerProvider({repo,source,destination,workspace}){
 const root=resolve(workspace),target=resolve(destination),within=relative(root,target);
 if(!within||within.startsWith('..')||isAbsolute(within)||target===resolve(repo)||target===resolve(source))throw Error('NEW_WORKSPACE_DIRECTORY_REQUIRED');
 try{await stat(target);throw Error('DESTINATION_ALREADY_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 const provider=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
 if(provider.name!=='ai-video-scriptwriter')throw Error('EXPECTED_PROVIDER_SOURCE_REQUIRED');
 const sources=[];
 for(const name of providerFiles){const path=join(source,'src',name),entry=await lstat(path),actual=await realpath(path),withinSource=relative(resolve(source),actual);if(!entry.isFile()||entry.isSymbolicLink()||withinSource.startsWith('..')||isAbsolute(withinSource))throw Error('EXPECTED_PROVIDER_SOURCE_FILE_REQUIRED');sources.push({name,bytes:await readFile(path)});}
 await mkdir(target,{recursive:true});
 for(const {name,bytes}of sources){const path=join(target,'src',name);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,bytes,{flag:'wx'});}
 await mkdir(join(target,'seller'));
 const hashes=[];
 for(const file of runtimeFiles){const bytes=await readFile(join(repo,'examples',file));await writeFile(join(target,'seller',file),bytes,{flag:'wx'});hashes.push({path:'seller/'+file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
 const server=[
  "import express from 'express';",
  "import {configureMarketplacePreviewApp} from './src/preview-app.js';",
  "import {createHostedSellerHandler} from './seller/seller-hosted-handler.mjs';",
  "export const app=express();",
  "app.disable('x-powered-by');",
  "app.get('/api/bazaar/seller/tick',async(req,res)=>{",
  " try{",
  " const host=process.env.VERCEL_URL||'localhost';",
  " const headers=new Headers();for(const [name,value]of Object.entries(req.headers)){if(Array.isArray(value))for(const item of value)headers.append(name,item);else if(value!==undefined)headers.set(name,value);}",
  " const request=new Request('https://'+host+req.originalUrl,{method:req.method,headers});",
  " const result=await createHostedSellerHandler()(request);res.status(result.status);result.headers.forEach((value,name)=>res.setHeader(name,value));res.send(await result.text());",
  " }catch{res.status(503).set({'cache-control':'no-store','retry-after':'120'}).json({error:'WORKER_UNAVAILABLE',paymentSubmissions:0});}",
  "});",
  "configureMarketplacePreviewApp(app);",
  "export default app;",
  ""
 ].join('\n');
 await writeFile(join(target,'server.ts'),server,{flag:'wx'});
 await writeFile(join(target,'seller/seller-hosted-handler.d.mts'),'export function createHostedSellerHandler(environment?:Readonly<Record<string,string|undefined>>): (request:Request)=>Promise<Response>;\n',{flag:'wx'});
 const packageJson={name:provider.name,version:'1.0.1',private:true,type:'module',description:'Owned algorithmic text provider with bounded durable Bazaar seller ticks',engines:{node:'24.x'},scripts:{build:'tsc'},dependencies:{...provider.dependencies,'@modelcontextprotocol/sdk':'1.30.0','@stellar/stellar-sdk':'14.4.2'},devDependencies:provider.devDependencies};
 await writeFile(join(target,'package.json'),JSON.stringify(packageJson,null,2)+'\n',{flag:'wx'});
 const tsconfig=JSON.parse(await readFile(join(source,'tsconfig.json'),'utf8'));tsconfig.include=['src/**/*','server.ts'];await writeFile(join(target,'tsconfig.json'),JSON.stringify(tsconfig,null,2)+'\n',{flag:'wx'});
 await writeFile(join(target,'vercel.json'),JSON.stringify({version:2,regions:['iad1'],crons:[{path:'/api/bazaar/seller/tick',schedule:'*/5 * * * *'}],functions:{'server.ts':{maxDuration:60}}},null,2)+'\n',{flag:'wx'});
 const ignore=['/*','!/package.json','!/package-lock.json','!/tsconfig.json','!/vercel.json','!/.vercelignore','!/server.ts','!/src','!/src/**','!/seller','!/seller/**','**/.env','**/.env.*','**/.vercel','**/.git','**/node_modules','**/dist','**/test','**/tests','**/fixtures','**/*.test.*','**/*.spec.*','**/*.log','**/*.key','**/*.pem','**/*.dpapi','**/*secrets*.json','**/*credentials*.json',''];
 await writeFile(join(target,'.vercelignore'),ignore.join('\n'),{flag:'wx'});
 for(const {name,bytes}of sources)hashes.push({path:'src/'+name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 for(const name of ['server.ts','seller/seller-hosted-handler.d.mts','package.json','tsconfig.json','vercel.json','.vercelignore']){const bytes=await readFile(join(target,name));hashes.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
 const manifest={status:'PREPARED_LOCAL',runtimeFiles:runtimeFiles.length,files:hashes,cron:{path:'/api/bazaar/seller/tick',schedule:'*/5 * * * *',previewAutomatic:false},credentialsCopied:false,payments:0,productionPublished:false};
 await writeFile(join(target,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Use: prepare-hosted-seller-provider.mjs <accepted-provider-source> <new-local-stage>');
 const manifest=await prepareHostedSellerProvider({repo:process.cwd(),source:resolve(source),destination:resolve(destination),workspace:resolve('..')});
 console.log(JSON.stringify({status:manifest.status,files:manifest.files.length,runtimeFiles:manifest.runtimeFiles,credentialsCopied:false,cron:manifest.cron,productionPublished:false}));
}
