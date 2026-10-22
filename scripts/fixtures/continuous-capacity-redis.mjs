import assert from 'node:assert/strict';
import {MARKET_CAPACITY_CAS} from '../../lib/marketplace-capacity.ts';
// Local exact-script protocol semantics for the native capacity CAS and its
// continuous sidecars. Hosted EVAL acceptance remains separate.
export function continuousCapacityRedis({data=new Map(),afterWrite}={}){
 const commits=[];
 return {data,commits,async get(key){return data.get(key)??null;},async eval(script,keys,args){
  if(script.includes('-- continuous-free-storage-initialize-v1')){if(data.has(keys[0]))return 0;for(let i=1;i<keys.length;i++)if(args[i]==='missing'?data.has(keys[i]):data.get(keys[i])!==args[i].slice(8))return 0;data.set(keys[0],args[0]);return 1;}
  assert.ok(script.startsWith('-- bazaar-market-capacity-cas-v1'));
  for(const [ki,ai]of [[0,0],[1,2],[2,4],[3,9],[4,11]]){if(args[ai]==='unchecked')continue;assert.ok(args[ai]==='missing'||args[ai]==='present');const old=data.get(keys[ki]);if(args[ai]==='missing'?old!==undefined:old!==args[ai+1])return 0;}
  if(args[13]){if(Date.now()>=Number(args[13]))return -1;}
  const draft=new Map(data),indexMatch=/local indexOld=redis\.call\('GET',KEYS\[(\d+)\]\)/.exec(script);
  if(indexMatch){const key=keys[+indexMatch[1]-1],ai=+/if ARGV\[(\d+)\]=='missing' then if indexOld/.exec(script)[1]-1,old=data.get(key);if(args[ai]==='missing'?old!==undefined:old!==args[ai+1])return 0;draft.set(key,args[ai+2]);}
  const storageMatch=/local storageOld=redis\.call\('GET',KEYS\[(\d+)\]\)/.exec(script);
  if(storageMatch){const key=keys[+storageMatch[1]-1],raw=data.get(key);if(!raw)return -21;const ledger=JSON.parse(raw),patch=JSON.parse(args[+/local patch=cjson.decode\(ARGV\[(\d+)\]\)/.exec(script)[1]-1]);
   for(const row of patch){const old=ledger.entries[row.key];if(old?old.bytes!==row.expected:row.expected!==0)return -20;const reserved=row.reserved??old?.reserved??0;if(!row.bytes&&!reserved)delete ledger.entries[row.key];else ledger.entries[row.key]={bytes:row.bytes,reserved};}
   const next=JSON.stringify(ledger);if(Object.values(ledger.entries).reduce((n,e)=>n+e.bytes+e.reserved,0)+Buffer.byteLength(next)>200000000)return -24;draft.set(key,next);
  }
  const operationMatch=/local config=cjson.decode\(ARGV\[(\d+)\]\);local request=cjson.decode\(ARGV\[(\d+)\]\)/.exec(script);
  if(operationMatch){const configuration=JSON.parse(args[+operationMatch[1]-1]),request=JSON.parse(args[+operationMatch[2]-1]),key=keys[+/local budget,status=budget_prepare\(redis.call\('GET',KEYS\[(\d+)\]\),config,request\)/.exec(script)[1]-1],raw=data.get(key),ledger=raw?JSON.parse(raw):{version:2,configuration:configuration.configurationId,last:Date.now(),buckets:[],held:[]};
   if(ledger.configuration!==configuration.configurationId||ledger.last>Date.now())return -10;
   const held=ledger.held.find(v=>v.operationId===request.operationId);if(held&&held.principalHash!==request.principalHash)return -12;
   if(request.action==='reserve'&&!held){if(ledger.held.reduce((n,v)=>n+v.transferBytes,0)+request.transferBytes>configuration.transferBytes)return -11;ledger.held.push({...request});delete ledger.held.at(-1).action;}
   if(request.action==='release')ledger.held=ledger.held.filter(v=>v.operationId!==request.operationId);
   draft.set(key,JSON.stringify(ledger));
  }
  if(script===MARKET_CAPACITY_CAS)assert.ok(args.length===13||args.length===14);
  for(let i=0;i<3;i++)if(args[6+i])draft.set(keys[i],args[6+i]);
  for(const[key,value]of draft)data.set(key,value);
  const committed={script,keys:[...keys],args:[...args]};commits.push(committed);await afterWrite?.(committed);return 1;
 }};
}
