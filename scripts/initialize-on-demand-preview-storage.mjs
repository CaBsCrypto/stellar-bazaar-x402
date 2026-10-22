// Complete, bounded inventory of existing synthetic Preview registries only.
// No SCAN, removal, content export, production keys or credential rotation.
import {Redis} from '@upstash/redis';
import {createHash} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {initializeContinuousStorageLedger,continuousStorageKey} from '../lib/continuous-free-storage.ts';
const family='pilot-14eed63c2c93c8d109322394f4e96a50',wp='bazaar-workspace:'+family,mp='bazaar-market:'+family,rp='bazaar-review:'+family;
const hash=x=>createHash('sha256').update(x).digest('hex'),output='docs/evidence/on-demand-preview-storage-inventory-2026-10-11.json';
const fail=code=>{throw Error(code);};
async function packet(){let bytes=0,chunks=[];for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>65536)fail('PRIVATE_INPUT_BOUND');chunks.push(chunk);}const value=JSON.parse(Buffer.concat(chunks).toString());chunks.forEach(c=>c.fill(0));if(Object.keys(value).sort().join(',')!=='token,url'||value.url!=='https://smooth-dory-323957.upstash.io'||typeof value.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(value.token))fail('EXISTING_LOCAL_VALIDATION_PROFILE_REQUIRED');return value;}
export async function initializePreviewInventory(redis){
 const rows=[],seen=new Set(),deadline=Date.now()+90000;let reads=0,bytes=0;
 async function get(key){if(++reads>1100||Date.now()>deadline||!key.startsWith(wp+':')&&!key.startsWith(mp+':')&&!key.startsWith(rp+':'))fail('ISOLATED_INVENTORY_BOUND');const raw=await redis.get(key);if(raw!==null&&typeof raw!=='string')fail('STRING_NATIVE_INVENTORY_REQUIRED');bytes+=raw===null?0:Buffer.byteLength(raw);if(bytes>20_000_000)fail('ISOLATED_INVENTORY_BOUND');return raw;}
 async function row(key,reservedBytes=0){if(seen.has(key))fail('DUPLICATE_INVENTORY_KEY');seen.add(key);const raw=await get(key);rows.push({key,expectedRaw:raw,nextRaw:raw,...(reservedBytes?{reservedBytes}:{})});return raw;}
 const registryKey=wp+`:{${family}}:registry`,registryRaw=await row(registryKey),registry=registryRaw?JSON.parse(registryRaw):{workspaces:[]};
 if(!Array.isArray(registry.workspaces)||registry.workspaces.length>200||new Set(registry.workspaces.map(w=>w.ownerId)).size!==registry.workspaces.length)fail('BOUNDED_NATIVE_REGISTRY_REQUIRED');
 await row(wp+`:{${family}}:initialized`);await row(wp+`:{${family}}:maintenance`);
 for(const workspace of registry.workspaces){if(!/^ow_[a-f0-9]{32}$/.test(workspace.ownerId))fail('NATIVE_OWNER_REQUIRED');await row(wp+`:{${family}}:owner:${workspace.ownerId}`);await row(wp+`:{${family}}:market-permissions:${workspace.ownerId}`);}
 const marketRaw=await row(mp+':state'),market=marketRaw?JSON.parse(marketRaw).state:{services:[]};
 if(!Array.isArray(market.services)||market.services.length>200||market.services.some(s=>!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.card?.id)))fail('BOUNDED_NATIVE_MARKET_REQUIRED');
 for(const suffix of [':x402-settlements:state',':capacity-reservations:v1',':maintenance-index:v1'])await row(mp+suffix);
 await row(rp+':state');
 // Native catalogue mirrors are bounded by the permanent marketplace service
 // registry. The Set and Redis key/object overhead fit the technical reserve.
 const ids=await redis.smembers(mp+':catalog:index');reads++;if(!Array.isArray(ids)||ids.some(id=>!market.services.some(s=>s.card.id===id)))fail('CATALOGUE_INVENTORY_MISMATCH');
 for(const id of ids)await row(mp+':catalog:card:'+id);
 // Includes 10 MB reserved for the independently capped provider journal and
 // 10 MB for control ledgers, Set/key overhead, quotas and temporary locks.
 await row(wp+':technical-reservation:v1',10_000_000);
 const key=continuousStorageKey(wp),prior=await get(key);
 let result;if(prior!==null){const ledger=JSON.parse(prior);if(ledger.version!==1||ledger.scope!==family||ledger.initialized!==true||!ledger.entries||Object.keys(ledger.entries).length!==rows.length||rows.some(row=>{const entry=ledger.entries[hash(row.key)];return !entry||entry.bytes!==(row.expectedRaw===null?0:Buffer.byteLength(row.expectedRaw))||!Number.isSafeInteger(entry.reserved)||entry.reserved<0||row.reservedBytes!==undefined&&entry.reserved!==row.reservedBytes;}))fail('INITIALIZATION_UNCONFIRMED');result={entries:Object.keys(ledger.entries).length,maximumBytes:200_000_000,recoveredReadOnly:true};}
 else result=await initializeContinuousStorageLedger(redis,wp,rows);
 const confirmed=await get(key);if(typeof confirmed!=='string'||JSON.parse(confirmed).initialized!==true)fail('INITIALIZATION_UNCONFIRMED');
 return {version:1,status:'PASS_SYNTHETIC_PREVIEW_STORAGE_INITIALIZED',workspaceCount:registry.workspaces.length,nativeKeysInventoried:rows.length,nativeBytesObserved:bytes,technicalReserveBytes:20_000_000,providerStorageCeilingBytes:10_000_000,maximumBytes:200_000_000,inventoryRegistryHash:registryRaw?hash(registryRaw):null,reads,readRecovery:result.recoveredReadOnly===true,namespaceFingerprint:hash(wp),observedAt:new Date().toISOString(),productionChanged:false,payments:0,secretValuesReturned:0};
}
try{
 if(process.argv[2]==='check'){console.log(JSON.stringify({status:'PREPARED_SYNTHETIC_PREVIEW_INVENTORY',namespaceFingerprint:hash(wp),maximumKeys:1100,maximumNativeBytes:20_000_000,technicalReserveBytes:20_000_000,networkRequests:0,productionChanged:false,payments:0}));}
 else{if(process.argv.length!==3||process.argv[2]!=='execute'||process.env.VERCEL)fail('EXPLICIT_LOCAL_PREVIEW_ACTION_REQUIRED');const profile=await packet(),redis=new Redis({...profile,automaticDeserialization:false,retry:false,enableAutoPipelining:false}),report=await initializePreviewInventory(redis);await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));}
}catch(error){console.log(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]{2,80}$/.test(error?.message??'')?error.message:'ISOLATED_INVENTORY_UNCONFIRMED',productionChanged:false,payments:0,secretValuesReturned:0}));process.exitCode=1;}
