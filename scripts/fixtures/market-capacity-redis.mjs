import assert from 'node:assert/strict';
import {MARKET_CAPACITY_CAS} from '../../lib/marketplace-capacity.ts';

// Protocol double: compare all snapshots before applying any write, with optional lost ACK.
// Real hosted EVAL verification remains a separate release gate.
export function capacityEval(data,script,keys,args,{afterWrite,redisNow=Date.now()}={}){
 assert.equal(script,MARKET_CAPACITY_CAS);
 assert.ok([13,14].includes(args.length));
 const snapshots=[[0,0],[1,2],[2,4],[3,9],[4,11]];
 for(const [keyIndex,argIndex] of snapshots){
  const kind=args[argIndex];if(kind==='unchecked')continue;
  assert.ok(kind==='missing'||kind==='present');
  const current=data.get(keys[keyIndex]);
  if(kind==='missing'?current!==undefined:current!==args[argIndex+1])return 0;
 }
 if(args[13]!==undefined&&args[13]!==''){
  const deadline=Number(args[13]);if(!Number.isSafeInteger(deadline)||deadline<=0)return -2;
  if(redisNow>=deadline)return -1;
 }
 for(let i=0;i<3;i++)if(args[6+i])data.set(keys[i],args[6+i]);
 afterWrite?.({keys,args});
 return 1;
}
export function capacityRedis({data=new Map(),beforeEval,afterWrite,redisNow=Date.now}={}){
 return {data,async get(key){return data.get(key)??null;},async eval(script,keys,args){await beforeEval?.({keys,args});return capacityEval(data,script,keys,args,{afterWrite,redisNow:redisNow()});}};
}
