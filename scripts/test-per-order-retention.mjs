import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createPerOrderRetentionPass,PER_ORDER_RETENTION_SCAN_BUDGET,PER_ORDER_RETENTION_ARCHIVE_BUDGET} from '../lib/per-order-retention.ts';
import {FIND_PER_ORDER_RETENTION_CANDIDATE,READ_PER_ORDER_RETENTION_CHECKPOINT,RETENTION_PAGE_SIZE,WRITE_PER_ORDER_RETENTION_CHECKPOINT,perOrderRetentionRedisDescriptor,retentionBuyerKey,retentionCheckpointKey} from '../lib/per-order-retention-redis.ts';
import {marketRecoveryRecord} from '../lib/market-retention-schema.ts';
import {MARKET_CONTENT_RETENTION_MS} from '../lib/market-file-delivery-schema.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';

const prefix='bazaar-market:pilot-'+'a'.repeat(32),namespace=prefix+':orders:v2:';
const first='ow_'+'1'.repeat(32),second='ow_'+'2'.repeat(32),seller='ow_'+'3'.repeat(32);
const now=Date.parse('2028-02-29T00:00:00.123Z'),cutoff=now-MARKET_CONTENT_RETENTION_MS;
const iso=(time)=>new Date(time).toISOString();
const member=(order)=>order.createdAt+'|'+order.operationId;
const row=(owner,created,phase='payment-uncertain')=>{
 const order={operationId:randomUUID(),buyerOwnerId:owner,sellerOwnerId:seller,createdAt:iso(created),phase,serviceId:'synthetic',cardHash:'a'.repeat(64),
  card:{delivery:syncDeliveryContract()},input:{secret:'private request'},inputHash:'b'.repeat(64),amount:'0.01',payer:'G'+'A'.repeat(55),destination:'G'+'B'.repeat(55),
  settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',sellerReservation:{committed:true},delivery:{text:'private result'}};
 const settlement={phase:'uncertain',authorizationFingerprint:'c'.repeat(64),transactionHash:'d'.repeat(64),payload:{transaction:'private XDR'}};
 return {operationId:order.operationId,buyerOwnerId:owner,createdAt:order.createdAt,order,settlement};
};

function harness(records,opts={}){
 const rows=new Map(records.map(record=>[record.operationId,structuredClone(record)]));
 const calls=[];let checkpoint=opts.checkpoint??'',writes=0,checks=0;
 const repository={async transact(id,mutate){
  calls.push('archive');checks++;
  if(opts.failedCommit)throw Error('lost archive acknowledgement');
  const prior=rows.get(id),next=structuredClone(prior),value=mutate(next);
  if(value){rows.set(id,next);writes++;}
  return value;
 }};
 const redis={async eval(script,keys,args){
  assert(perOrderRetentionRedisDescriptor(script,keys,args,namespace));
  if(script===READ_PER_ORDER_RETENTION_CHECKPOINT){calls.push('clock');return [checkpoint,String(Math.floor(now/1000)),String(now%1000*1000)];}
  if(script===WRITE_PER_ORDER_RETENTION_CHECKPOINT){
   calls.push('checkpoint');assert.equal(keys[0],retentionCheckpointKey(namespace));
   if(opts.failedCheckpoint||args[0]!==checkpoint)return 0;
   checkpoint=args[1];return 1;
  }
  assert.equal(script,FIND_PER_ORDER_RETENTION_CANDIDATE);calls.push('page');
  const [,owner,bound]=args;assert.equal(keys[0],retentionBuyerKey(namespace,owner));
  const page=[...rows.values()].filter(record=>record.buyerOwnerId===owner&&member(record)<bound.slice(1))
    .sort((a,b)=>member(a)<member(b)?1:-1).slice(0,RETENTION_PAGE_SIZE+1);
  const actionable=page.slice(0,RETENTION_PAGE_SIZE).findIndex(record=>record.order);
  if(actionable!==-1)return [actionable+1,member(page[actionable]),member(page[actionable]),Number(actionable+1<page.length)];
  const count=Math.min(page.length,RETENTION_PAGE_SIZE);
  return [count,count?member(page[count-1]):'','',Number(page.length>RETENTION_PAGE_SIZE)];
 }};
 const run=createPerOrderRetentionPass({redis,prefix,repository:()=>repository});
 return {rows,calls,get checkpoint(){return checkpoint;},get writes(){return writes;},get checks(){return checks;},
  run:(overrides={})=>run({owners:async()=>[second,first],archive:async work=>{calls.push('debit');return work();},available:()=>true,...overrides})};
}

test('purge uses the Redis cutoff and redacts completed and uncertain orders, retaining only recovery controls',async()=>{
 const expired=row(first,cutoff),fresh=row(first,cutoff+1),delivered=row(second,cutoff-1,'delivered');
 delivered.order.paymentVerifiedAt=iso(cutoff+1);
 const state=harness([expired,fresh,delivered]);
 assert.deepEqual(await state.run(),{scanned:1,archived:1,more:true});
 const archived=state.rows.get(expired.operationId);
 assert.equal(archived.order,undefined);assert.equal(archived.settlement,undefined);
 assert.deepEqual(archived.recovery,marketRecoveryRecord(expired.order,expired.settlement,now));
 assert.equal(archived.recovery.transactionHash,'d'.repeat(64));
 assert.equal(archived.recovery.authorizationFingerprint,'c'.repeat(64));
 assert.equal(archived.recovery.sellerReservationPending,true);
 assert(!JSON.stringify(archived).includes('private'));
 assert.equal(state.checkpoint,second);
 assert.equal((await state.run()).archived,1);
 assert.equal(state.rows.get(delivered.operationId).recovery.paymentPhase,'confirmed');
 assert.equal(state.rows.get(delivered.operationId).recovery.sellerReservationPending,undefined);
 assert.deepEqual(state.rows.get(fresh.operationId),fresh);
 assert.equal((await state.run()).archived,0);
 assert.equal(state.writes,2);
});

test('bounded pages advance past old tombstones and unknown-ack checkpoints never rearchive the same order',async()=>{
 const tombstones=Array.from({length:RETENTION_PAGE_SIZE},(_,i)=>{
  const {order,settlement,...record}=row(first,cutoff-i);return {...record,recovery:marketRecoveryRecord(order,settlement,now)};
 });
 const target=row(first,cutoff-RETENTION_PAGE_SIZE),opts={failedCheckpoint:false};
 const state=harness([...tombstones,target],opts);
 assert.deepEqual(await state.run(),{scanned:RETENTION_PAGE_SIZE,archived:0,more:true});
 assert.equal(state.checkpoint,first+'|'+member(tombstones.at(-1)));
 opts.failedCheckpoint=true;
 await assert.rejects(state.run(),{code:'PER_ORDER_RETENTION_UNCONFIRMED'});
 assert.equal(state.writes,1);
 opts.failedCheckpoint=false;
 assert.equal((await state.run()).archived,0);
 assert.equal(state.checks,1);
});

test('an uncertain payment without a saved transaction retains its replay claim and reservation',async()=>{
 const pending=row(first,cutoff);
 delete pending.settlement.transactionHash;
 const state=harness([pending]);
 assert.equal((await state.run()).archived,1);
 const {order,settlement,recovery}=state.rows.get(pending.operationId);
 assert.equal(order,undefined);assert.equal(settlement,undefined);
 assert.equal(recovery.paymentPhase,'uncertain');assert.equal(recovery.transactionHash,undefined);
 assert.equal(recovery.authorizationFingerprint,'c'.repeat(64));assert.equal(recovery.sellerReservationPending,true);
});

test('budget denial, write conflicts and unexpected file metadata never advance past an unarchived candidate',async()=>{
 const target=row(first,cutoff),opts={failedCommit:false},state=harness([target],opts);
 await assert.rejects(state.run({archive:async()=>{throw Error('budget denied');}}),/budget denied/);
 assert.equal(state.checks,0);assert.equal(state.checkpoint,'');
 opts.failedCommit=true;
 await assert.rejects(state.run(),/lost archive acknowledgement/);
 assert.equal(state.checkpoint,'');assert.equal(state.writes,0);
 opts.failedCommit=false;
 state.rows.get(target.operationId).order.fileReservation={unexpected:true};
 await assert.rejects(state.run(),{code:'PER_ORDER_RETENTION_UNCONFIRMED'});
 assert.equal(state.checkpoint,'');assert.equal(state.writes,0);
 assert(!state.calls.includes('checkpoint'));
});

test('retention descriptors bind scripts to the checkpoint and the indexed buyer',()=>{
 const cp=retentionCheckpointKey(namespace),key=retentionBuyerKey(namespace,first);
 const args=[namespace,first,'('+member(row(first,cutoff))];
 assert.equal(perOrderRetentionRedisDescriptor(FIND_PER_ORDER_RETENTION_CANDIDATE,[key],args,namespace).commands,2+RETENTION_PAGE_SIZE);
 assert.throws(()=>perOrderRetentionRedisDescriptor(FIND_PER_ORDER_RETENTION_CANDIDATE,[key],[namespace,second,args[2]],namespace),{code:'PER_ORDER_TRANSPORT_BUDGET'});
 assert.throws(()=>perOrderRetentionRedisDescriptor(WRITE_PER_ORDER_RETENTION_CHECKPOINT,[cp],['','unexpected'],namespace),{code:'PER_ORDER_TRANSPORT_BUDGET'});
 assert(3+4+4*(2+RETENTION_PAGE_SIZE)+3<=PER_ORDER_RETENTION_SCAN_BUDGET.commands);
 assert.equal(PER_ORDER_RETENTION_ARCHIVE_BUDGET.commands,64);
});
