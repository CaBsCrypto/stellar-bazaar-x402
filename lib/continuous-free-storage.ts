import {createHash} from 'node:crypto';
import {WorkspaceError} from './workspace-types.ts';
import {continuousFreeBudgetConfiguration} from './continuous-free-budget.ts';

export const CONTINUOUS_FREE_STORAGE_MAX=200_000_000;
// Reserved for native key names, Redis object overhead, the command ledger,
// bounded rate counters and the provider's separately scoped checkpoint.
export const CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE=10_000_000;
export const CONTINUOUS_FREE_STORAGE_LEDGER_MAX=2_000_000;
export type ContinuousStorageWrite={key:string;expectedRaw:string|null;nextRaw:string|null;reservedBytes?:number};
type Redis={eval(script:string,keys:string[],args:string[]):Promise<unknown>};
type Ledger={version:1;scope:string;initialized:true;entries:Record<string,{bytes:number;reserved:number}>};
function hash(key:string){return createHash('sha256').update(key).digest('hex');}
function scope(prefix:string){if(!/^bazaar-workspace:(pilot-[a-f0-9]{32}|isolated-[a-f0-9]{32}|local-test|preview|production)$/.test(prefix))throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');return prefix.split(':')[1];}
export function continuousStorageKey(prefix:string){return `${prefix}:{${scope(prefix)}}:continuous-free-storage:v1`;}
function allowedKey(key:string,prefix:string){const name=scope(prefix);return ['bazaar-workspace:','bazaar-market:','bazaar-review:','bazaar-providers:','bazaar-seller:'].some(p=>key.startsWith(p+name+':'))&&key.length<=512;}
function parse(raw:unknown,prefix:string):Ledger{
 if(typeof raw!=='string'||Buffer.byteLength(raw)>CONTINUOUS_FREE_STORAGE_LEDGER_MAX)throw new WorkspaceError('FREE_DEMO_STORAGE_UNINITIALIZED');
 try{const value=JSON.parse(raw);if(value.version!==1||value.scope!==scope(prefix)||value.initialized!==true||typeof value.entries!=='object'||!value.entries||Array.isArray(value.entries)||Object.keys(value).sort().join(',')!=='entries,initialized,scope,version')throw Error();
 for(const [key,entry] of Object.entries(value.entries) as [string,{bytes:number;reserved:number}][]){if(!/^[a-f0-9]{64}$/.test(key)||!entry||Object.keys(entry).sort().join(',')!=='bytes,reserved'||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!Number.isSafeInteger(entry.reserved)||entry.reserved<0)throw Error();}
 return value;}catch{throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');}
}
function assertSize(ledger:Ledger){const raw=JSON.stringify(ledger),total=Object.values(ledger.entries).reduce((n,v)=>n+v.bytes+v.reserved,0);if(total+Buffer.byteLength(raw)+CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE>CONTINUOUS_FREE_STORAGE_MAX||Buffer.byteLength(raw)>CONTINUOUS_FREE_STORAGE_LEDGER_MAX)throw new WorkspaceError('FREE_DEMO_STORAGE_CAPACITY',503);return raw;}

/** The caller proves the inventory is complete using its native registries.
 * Every inventoried snapshot is compared inside EVAL; replacement is forbidden.
 * No SCAN, deletion, resets, or silent creation from a missing ledger. */
export async function initializeContinuousStorageLedger(redis:Redis,prefix:string,inventory:ContinuousStorageWrite[]){
 if(!Array.isArray(inventory)||inventory.length>10000)throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');
 const entries:Ledger['entries']={},seen=new Set<string>();
 for(const row of inventory){if(!allowedKey(row.key,prefix)||seen.has(row.key)||row.expectedRaw!==row.nextRaw||(row.expectedRaw!==null&&typeof row.expectedRaw!=='string')||row.reservedBytes!==undefined&&(!Number.isSafeInteger(row.reservedBytes)||row.reservedBytes<0))throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');seen.add(row.key);entries[hash(row.key)]={bytes:row.expectedRaw===null?0:Buffer.byteLength(row.expectedRaw),reserved:row.reservedBytes??0};}
 const raw=assertSize({version:1,scope:scope(prefix),initialized:true,entries});
 const script=`-- continuous-free-storage-initialize-v1
if redis.call('GET',KEYS[1]) then return 0 end
for i=2,#KEYS do local old=redis.call('GET',KEYS[i]);local expected=ARGV[i];if expected=='missing' then if old then return 0 end else if not old or old~=string.sub(expected,9) then return 0 end end end
redis.call('SET',KEYS[1],ARGV[1]);return 1`;
 try{const result=await redis.eval(script,[continuousStorageKey(prefix),...inventory.map(v=>v.key)],[raw,...inventory.map(v=>v.expectedRaw===null?'missing':'present:'+v.expectedRaw)]);if(result!==1)throw new WorkspaceError('FREE_DEMO_STORAGE_INITIALIZATION_UNCONFIRMED',409);}catch(error){if(error instanceof WorkspaceError)throw error;throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');}
 return {entries:inventory.length,totalBytes:Object.values(entries).reduce((n,v)=>n+v.bytes+v.reserved,0),maximumBytes:CONTINUOUS_FREE_STORAGE_MAX};
}

/** A native CAS includes this sidecar snapshot and write in its own Lua.
 * Both helpers must be appended after all native guards, before native SETs.
 * Ledger misses are allowed only for a native key proven absent by the CAS.
 * Existing unindexed keys require explicit complete-inventory initialization. */
export async function prepareContinuousStorageCommit(redis:Redis,prefix:string,writes:ContinuousStorageWrite[]){
 if(!continuousFreeBudgetConfiguration())return undefined;
 if(!Array.isArray(writes)||writes.length>16||new Set(writes.map(v=>v.key)).size!==writes.length)throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');
 const key=continuousStorageKey(prefix),patch=[];
 for(const row of writes){
  if(!allowedKey(row.key,prefix)||(row.expectedRaw!==null&&typeof row.expectedRaw!=='string')||(row.nextRaw!==null&&typeof row.nextRaw!=='string')||row.reservedBytes!==undefined&&(!Number.isSafeInteger(row.reservedBytes)||row.reservedBytes<0))throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');
  patch.push({key:hash(row.key),expected:row.expectedRaw===null?0:Buffer.byteLength(row.expectedRaw),bytes:row.nextRaw===null?0:Buffer.byteLength(row.nextRaw),reserved:row.reservedBytes??null});
 }
 return {keys:[key],args:[scope(prefix),JSON.stringify(patch)],appendScript(keyIndex:number,argIndex:number){return `
local storageOld=redis.call('GET',KEYS[${keyIndex}])
if not storageOld then return -21 end
if string.len(storageOld)>2000000 then return -22 end
local valid,storage=pcall(cjson.decode,storageOld)
if not valid or type(storage)~='table' or storage.version~=1 or storage.scope~=ARGV[${argIndex}] or storage.initialized~=true or type(storage.entries)~='table' then return -22 end
local total=0
for key,entry in pairs(storage.entries) do
 if type(key)~='string' or string.len(key)~=64 or type(entry)~='table' or type(entry.bytes)~='number' or entry.bytes<0 or entry.bytes%1~=0 or type(entry.reserved)~='number' or entry.reserved<0 or entry.reserved%1~=0 then return -22 end
 total=total+entry.bytes+entry.reserved
end
local patch=cjson.decode(ARGV[${argIndex+1}])
for _,row in ipairs(patch) do
 local old=storage.entries[row.key]
 if old then if old.bytes~=row.expected then return -20 end;total=total-old.bytes-old.reserved elseif row.expected~=0 then return -23 end
 local reserved=row.reserved;if reserved==cjson.null then reserved=old and old.reserved or 0 end
 total=total+row.bytes+reserved
 if row.bytes==0 and reserved==0 then storage.entries[row.key]=nil else storage.entries[row.key]={bytes=row.bytes,reserved=reserved} end
end
local storageNext=cjson.encode(storage)
if string.len(storageNext)>2000000 or total+string.len(storageNext)+10000000>200000000 then return -24 end
`;},writeScript(keyIndex:number){return `redis.call('SET',KEYS[${keyIndex}],storageNext)\n`;}};
}
