import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {dirname,resolve,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const PROVIDER_KIT_MODULES=Object.freeze([
 'marketplace-seller-mcp.mjs','seller-marketplace-worker.mjs','seller-marketplace-supervisor.mjs',
 'seller-marketplace-capacity.mjs','seller-http-adapter.mjs','seller-runtime.mjs',
 'seller-service-card.mjs','seller-mcp-transport.mjs','private-mcp-client.mjs',
 'market-price.mjs','buyer-private-input.mjs','buyer-portable-secret-store.mjs'
]);
export const PROVIDER_KIT_DEPENDENCIES=Object.freeze({'@modelcontextprotocol/sdk':'1.30.0','@stellar/stellar-sdk':'14.4.2'});
export const PROVIDER_KIT_NAME='bazaar-native-text-provider-kit';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const text=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));

/** Copy exact existing lock records, including integrity and peer resolution.
 * No fabricated versions, registry request or dependency installation occurs. */
export function providerKitLock(source,pkg){
 assert.equal(source.lockfileVersion,3);const packages={'':{name:pkg.name,version:pkg.version,license:pkg.license,dependencies:pkg.dependencies,engines:pkg.engines}};
 const queue=Object.keys(pkg.dependencies).map(name=>'node_modules/'+name),seen=new Set();
 const dependency=(from,name)=>{
  for(let parent=from;;){const candidate=(parent?parent+'/':'')+'node_modules/'+name;if(source.packages[candidate])return candidate;if(!parent)return;const at=parent.lastIndexOf('/node_modules/');parent=at>=0?parent.slice(0,at):'';}
 };
 for(let index=0;index<queue.length;index++){
  const path=queue[index];if(seen.has(path))continue;seen.add(path);const record=source.packages[path];assert.ok(record,path+' missing from reviewed lock');
  assert.ok(/^\d+\.\d+\.\d+/.test(record.version??''));assert.ok(record.resolved?.startsWith('https://registry.npmjs.org/'));assert.ok(/^sha(?:256|384|512)-/.test(record.integrity??''));assert.ok(!record.link);
  const copy=structuredClone(record);delete copy.dev;delete copy.devOptional;packages[path]=copy;
  for(const name of Object.keys({...record.dependencies,...record.optionalDependencies,...record.peerDependencies})){
   const selected=dependency(path,name);const optional=Object.hasOwn(record.optionalDependencies??{},name)||record.peerDependenciesMeta?.[name]?.optional;
   assert.ok(selected||optional,path+' unresolved dependency '+name);if(selected)queue.push(selected);
  }
 }
 const ordered=Object.fromEntries(Object.entries(packages).sort(([a],[b])=>a.localeCompare(b,'en')));
 for(const [name,version]of Object.entries(pkg.dependencies))assert.equal(ordered['node_modules/'+name].version,version);
 return {name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:ordered};
}

function tarEntry(name,bytes){
 assert.ok(Buffer.byteLength(name)<=100&&!name.startsWith('/')&&!name.includes('..'));
 const header=Buffer.alloc(512),put=(value,offset,length)=>header.write(value,offset,length,'ascii');
 put(name,0,100);put('0000644\0',100,8);put('0000000\0',108,8);put('0000000\0',116,8);
 put(bytes.length.toString(8).padStart(11,'0')+'\0',124,12);put('00000000000\0',136,12);header.fill(32,148,156);put('0',156,1);put('ustar\0',257,6);put('00',263,2);
 const checksum=[...header].reduce((sum,value)=>sum+value,0);put(checksum.toString(8).padStart(6,'0')+'\0 ',148,8);
 return Buffer.concat([header,bytes,Buffer.alloc((512-bytes.length%512)%512)]);
}

export async function buildProviderKit({write=true}={}){
 const pkg={name:PROVIDER_KIT_NAME,version:'1.0.0',private:true,type:'module',license:'Apache-2.0',engines:{node:'24.x'},scripts:{check:'node self-check.mjs',seller:'node examples/marketplace-seller-mcp.mjs',card:'node examples/marketplace-seller-mcp.mjs card',supervisor:'node examples/seller-marketplace-supervisor.mjs',runtime:'node examples/seller-runtime.mjs'},dependencies:{...PROVIDER_KIT_DEPENDENCIES}};
 const lockBytes=await readFile(resolve(repo,'package-lock.json')),lock=providerKitLock(JSON.parse(lockBytes),pkg),files=new Map();
 for(const name of PROVIDER_KIT_MODULES)files.set('examples/'+name,text(await readFile(resolve(repo,'examples',name))));
 for(const name of ['README.md','adapter-template.mjs','configure.mjs','self-check.mjs'])files.set(name,text(await readFile(resolve(repo,'scripts/provider-kit',name))));
 files.set('LICENSE',text(await readFile(resolve(repo,'LICENSE'))));files.set('package.json',json(pkg));files.set('package-lock.json',json(lock));
 const card=JSON.parse(await readFile(resolve(repo,'public/examples/native-text-service-card.json'),'utf8'));
 const {sellerCanonical,sellerHash,assertSellerCard}=await import(pathToFileURL(resolve(repo,'examples/seller-service-card.mjs')).href);assertSellerCard(card);
 const configuration={bazaarOrigin:'https://bazaar.browns.studio',ownerId:'ow_'+'0'.repeat(32),agentId:'agent_'+'0'.repeat(32),card,cardHash:sellerHash(sellerCanonical(card)),allowedOrigins:[card.url],controlProof:{method:'http-well-known',domain:new URL(card.url).hostname}};
 files.set('native-text-service-card.example.json',json(card));files.set('configuration.example.json',json(configuration));
 files.set('definition.example.json',json({id:card.id,name:card.name,description:card.description,providerName:card.provider.name,providerOrigin:card.url,route:card.routeTemplate,destination:card.payment.destination,input:card.input,tags:card.tags,amount:card.payment.amount}));
 const payloadManifest={version:1,name:pkg.name,packageVersion:pkg.version,node:pkg.engines.node,directDependencies:pkg.dependencies,files:[...files.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)})),networkRequests:0,credentialsIncluded:false,adapterReadyByDefault:false};
 files.set('MANIFEST.json',json(payloadManifest));
 const tar=Buffer.concat([...files.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,bytes])=>tarEntry(PROVIDER_KIT_NAME+'/'+path,bytes)).concat(Buffer.alloc(1024)));
 const archive=gzipSync(tar,{level:9}),archiveName=PROVIDER_KIT_NAME+'.tgz';
 const manifest={version:1,name:pkg.name,packageVersion:pkg.version,archive:'/downloads/'+archiveName,sha256:sha(archive),bytes:archive.length,node:pkg.engines.node,directDependencies:pkg.dependencies,lockedDependencyPackages:Object.keys(lock.packages).length-1,sourceLockSha256:sha(lockBytes),payloadManifestSha256:sha(files.get('MANIFEST.json')),files:[...payloadManifest.files,{path:'MANIFEST.json',bytes:files.get('MANIFEST.json').length,sha256:sha(files.get('MANIFEST.json'))}],reproducibleArchive:{order:'sorted paths',mtime:0,uid:0,gid:0,mode:'0644',textLineEndings:'LF'},networkRequests:0,credentialsIncluded:false,adapterReadyByDefault:false};
 if(write){const directory=resolve(repo,'public/downloads');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,archiveName),archive);await writeFile(resolve(directory,PROVIDER_KIT_NAME+'.manifest.json'),json(manifest));}
 return {archive,manifest,files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const {manifest}=await buildProviderKit();console.log(JSON.stringify({status:'PREPARED_LOCAL',archive:manifest.archive,sha256:manifest.sha256,bytes:manifest.bytes,files:manifest.files.length,lockedDependencyPackages:manifest.lockedDependencyPackages,networkRequests:0}));}
