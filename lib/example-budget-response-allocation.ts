import {exampleBudgetCommandDescriptor} from './example-budget-command-weight.ts';

const KiB=1024,MiB=1048576;
const namespace='(?:pilot-[a-f0-9]{32}|isolated-[a-f0-9]{32}|local-test|production|preview)';
const workspace=new RegExp('^bazaar-workspace:'+namespace+':');
const market=new RegExp('^bazaar-market:'+namespace+':');
const review=new RegExp('^bazaar-review:'+namespace+':');
/** Every approved native writer enforces these raw caps. The allocation covers
 * both outer JSON escaping and SDK base64 encoding, plus the response envelope
 * and headers. Unknown GET keys retain the widest existing allocation. */
export function exampleBudgetRedisResponseAllocation(body:unknown){
 const descriptor=exampleBudgetCommandDescriptor(body),category=descriptor.category;
 if(category==='get'){
  const key=descriptor.keys[0];let rawCap:number|undefined;
  if(workspace.test(key)){
   if(/:registry$/.test(key))rawCap=MiB;
   else if(/:owner:ow_[a-f0-9]{32}$/.test(key))rawCap=128*KiB;
   else if(/:market-permissions:ow_[a-f0-9]{32}$/.test(key))rawCap=4*KiB;
   else if(/:continuous-free-budget:v1$/.test(key))rawCap=256*KiB;
   else if(/:continuous-free-storage:v1$/.test(key))rawCap=2_000_000;
   else if(/:maintenance$/.test(key))rawCap=512;
   else if(/:(?:marker|initialized)$/.test(key))rawCap=512;
  }else if(market.test(key)){
   if(/:x402-settlements:state$/.test(key))rawCap=128*KiB;
   else if(/:capacity-reservations:v1$/.test(key))rawCap=64*KiB;
   else if(/:state$/.test(key))rawCap=512*KiB;
   else if(/:maintenance-index:v1$/.test(key))rawCap=512;
   else if(/:maintenance$/.test(key))rawCap=128*KiB;
  }else if(review.test(key)&&/:state$/.test(key))rawCap=MiB;
  return rawCap===undefined?4*MiB+8192:2*rawCap+8192;
 }
 if(category==='workspace-read')return 2*(MiB+128*KiB+512)+8192;
 if(category==='permission-read')return 2*(MiB+128*KiB+4*KiB+512)+8192;
 if(category==='workspace-storage-read')return 4_000_000+8192;
 if(category==='maintenance-read')return 2*512+8192;
 // All remaining exact, reviewed script hashes return only a scalar or the
 // four-item command-budget tuple. A new script hash is rejected upstream.
 return 8192;
}
