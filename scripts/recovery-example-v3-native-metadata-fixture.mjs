// Native schema validation through an injected in-memory Redis; no Lua is run.
import {createHash} from 'node:crypto';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,READ_WORKSPACE_MAINTENANCE_LUA,COMMIT_WORKSPACE_LUA} from '../lib/workspace-store.ts';
const hash=value=>createHash('sha256').update(value).digest('hex'),bytes=value=>Buffer.byteLength(JSON.stringify(value)),prefix='bazaar-workspace:local-test';
export async function makeV3NativeMetadataFixture(style='quotes'){
 if(!['quotes','unicode'].includes(style))throw Error('EXACT_METADATA_FIXTURE_STYLE_REQUIRED');
 const flags=['BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE','BAZAAR_EXAMPLE_TEXT_TRANSFER_BUDGET_BYTES','BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES','BAZAAR_ACCEPTANCE_METER','BAZAAR_OPERATIONAL_METER','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY'],saved=Object.fromEntries(flags.map(key=>[key,process.env[key]])),data=new Map();let injectedReads=0,injectedSetupWrites=0;
 const redis={async eval(script,keys,args){
  if(script===READ_WORKSPACE_LUA){injectedReads++;return keys.map(key=>data.get(key)??'');}
  if(script===READ_WORKSPACE_MAINTENANCE_LUA){injectedReads++;const now=Date.now();return [data.get(keys[0])??'',String(Math.floor(now/1000)),String((now%1000)*1000)];}
  if(script!==COMMIT_WORKSPACE_LUA||keys.length!==3||args.length!==5)throw Error('FIXTURE_UNKNOWN_NATIVE_SCRIPT');
  for(let i=0;i<3;i++)if((data.get(keys[i])??'')!==args[i])return 0;
  data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');injectedSetupWrites++;return 1;
 }};
 try{
  flags.forEach(key=>delete process.env[key]);
  const store=createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]})),agentHash=hash('synthetic-v3-agent'),created=await store.createWorkspace({creationId:'00000000-0000-4000-8000-000000000001',humanAccessHash:hash('synthetic-v3-human'),agentAccessHash:agentHash},hash('synthetic-v3-bootstrap'),'synthetic-v3-ip');
  const registryKey=[...data.keys()].find(key=>key.endsWith(':registry')),registry=JSON.parse(data.get(registryKey)),until=Date.now()+3600000;
  const initial=registry.creationWindows;
  const windows=n=>Array.from({length:n},(_,at)=>({key:('pad-'+at+'-')+(style==='quotes'?'"':'漢').repeat(88),count:0,until}));
  let low=0,high=10000;while(low<high){const n=Math.ceil((low+high)/2);registry.creationWindows=[...initial,...windows(n)];if(bytes(registry)<=1048576-512)low=n;else high=n-1;}
  registry.creationWindows=[...initial,...windows(low)];const registryRaw=JSON.stringify(registry);data.set(registryKey,registryRaw);
  const principal=await store.resolveHash(agentHash);if(principal.ownerId!==created.record.ownerId)throw Error('NATIVE_METADATA_FIXTURE_IDENTITY_MISMATCH');
  const index=JSON.stringify({version:1,registryRevision:registry.revision,initialized:true,nextExpiryAt:null}).padEnd(512,' ');data.set(prefix+':{local-test}:maintenance',index);const maintenance=await store.maintenanceIndex();if(!maintenance.initialized)throw Error('NATIVE_METADATA_FIXTURE_INDEX_UNCONFIRMED');
  return {style,validatedByNativeStore:true,registryRaw,maintenanceRaw:index,registryRawBytes:Buffer.byteLength(registryRaw),registryOuterJsonStringBytes:Buffer.byteLength(JSON.stringify(registryRaw)),registryMaximumRawBytes:1048576,registryUtilization:Buffer.byteLength(registryRaw)/1048576,injectedReads,injectedSetupWrites,networkRequests:0,luaExecutions:0,realRedisWrites:0,payments:0};
 }finally{for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
