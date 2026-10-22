// Offline evaluator for the three exact Redis scripts used by the encrypted
// seller store. Counters include executed Lua redis.call operations separately.
export function sellerRedisMemory(now){
 const data=new Map(),topLevel={},lua={};
 const count=(map,name)=>{map[name]=(map[name]??0)+1;};
 const primitive=(name,args,inside=false)=>{
  count(inside?lua:topLevel,name);
  if(name==='GET')return data.get(args[0])??null;
  if(name==='EXISTS')return data.has(args[0])?1:0;
  if(name==='SET'){if(args.includes('NX')&&data.has(args[0]))return null;data.set(args[0],String(args[1]));return 'OK';}
  if(name==='DEL')return data.delete(args[0])?1:0;
  if(name==='TIME')return [String(Math.floor(now()/1000)),String(now()%1000*1000)];
  throw Error('UNSUPPORTED_REDIS_PRIMITIVE');
 };
 const execute=command=>{
  const [name,...values]=command;if(name!=='EVAL')return primitive(name,values);
  count(topLevel,'EVAL');const [script,number,...items]=values,n=Number(number),keys=items.slice(0,n),args=items.slice(n),call=(name,...args)=>primitive(name,args,true);
  const project=raw=>{if(!raw)return undefined;const ledger=JSON.parse(raw);for(const[id,e]of Object.entries(ledger.entries))if(e.expiresAt>0&&e.expiresAt<=now())delete ledger.entries[id];return ledger;};
  const size=ledger=>1_000_000+Object.values(ledger.entries).reduce((n,e)=>n+e.bytes,0)+Buffer.byteLength(JSON.stringify(ledger));
  if(script.startsWith('-- seller-storage-initialize-v1')){if(call('GET',keys[0]))return 0;for(let i=1;i<keys.length;i++){const old=call('GET',keys[i]);if(args[i]==='missing'?old!==null:old!==args[i].slice(8))return 0;}call('SET',keys[0],args[0]);return 1;}
  if(script.startsWith('-- seller-storage-read-v1')){call('TIME');const ledger=project(call('GET',keys[0]));if(!ledger||ledger.binding!==args[0])return [-3,0];return [1,10_000_000-size(ledger)];}
  if(script.startsWith('for i=1,#KEYS do')){for(let i=0;i<keys.length;i++)if(call('GET',keys[i])!==args[i])return 0;return 1;}
  if(script.startsWith("if redis.call('GET',KEYS[1])"))return call('GET',keys[0])===args[0]?call('DEL',keys[0]):0;
  const budgeted=script.startsWith('-- seller-storage-write-v1');
  if(!budgeted&&!script.startsWith('local locks=tonumber(ARGV[1])'))throw Error('UNSUPPORTED_REDIS_SCRIPT');
  const locks=Number(args[0]);for(let i=0;i<locks;i++)if(call('GET',keys[i])!==args[i+1])return -1;
  const dataKey=keys[locks],guardKey=keys[locks+1],prior=call('GET',dataKey),at=locks+1;
  if(args[at]==='missing'){if(prior||call('EXISTS',guardKey)===1)return 0;}else if(prior!==args[at+1])return 0;
  const expiry=Number(args[at+4]);let ledger;
  if(budgeted){call('TIME');ledger=project(call('GET',keys[locks+2]));if(!ledger||ledger.binding!==args[at+5])return -3;const id=args[at+6],old=ledger.entries[id],expected=prior?Buffer.byteLength(prior)+Buffer.byteLength(dataKey):0;if(old?old.bytes!==expected:expected!==0)return -3;ledger.entries[id]={bytes:Buffer.byteLength(args[at+2])+Buffer.byteLength(dataKey),expiresAt:expiry};if(args[at+3]){const guardId=args[at+7],oldGuard=ledger.entries[guardId],raw=call('GET',guardKey),expectedGuard=raw?Buffer.byteLength(raw)+Buffer.byteLength(guardKey):0;if(oldGuard?oldGuard.bytes!==expectedGuard:expectedGuard!==0)return -3;ledger.entries[guardId]={bytes:Buffer.byteLength(args[at+3])+Buffer.byteLength(guardKey),expiresAt:0};}if(size(ledger)>10_000_000)return -4;}
  if(expiry>0){call('TIME');if(expiry<=now())return -2;call('SET',dataKey,args[at+2],'PXAT',expiry);}else call('SET',dataKey,args[at+2]);
  if(args[at+3]!=='')call('SET',guardKey,args[at+3]);if(ledger)call('SET',keys[locks+2],JSON.stringify(ledger));return 1;
 };
 const snapshot=()=>({restRequests:Object.values(topLevel).reduce((a,b)=>a+b,0),topLevel:{...topLevel},lua:{...lua},executionsIncludingEval:Object.values(topLevel).reduce((a,b)=>a+b,0)+Object.values(lua).reduce((a,b)=>a+b,0)});
 return {execute,snapshot,data};
}
