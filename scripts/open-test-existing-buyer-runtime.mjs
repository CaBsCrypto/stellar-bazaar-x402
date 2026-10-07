import assert from 'node:assert/strict';
import {buyerIdentity} from '../examples/marketplace-x402-buyer.mjs';
import {openHash} from './open-acceptance-plan.mjs';
import {existingBuyerStoreDirectory,openExistingBuyerSpendLedger,createExistingOpenPrivateRuntime} from './open-existing-buyer-runtime.mjs';

const wallet='GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU',ownerId='ow_47431fe9e36e4538896cf94f0ca428c1';
const oldIds=['cc11332d-bfcc-4e93-bee1-6d9e9d784d4d','9ed25d18-b6e2-4bfb-8c69-17c6f24648b5'],newIds=['f805ebd6-7b17-48ef-8967-ed8fa4e4ea98','86dabee7-0c8d-4090-b8fa-2de0214d5b2c'];
const reservation=operationId=>({operationId,payer:wallet,asset:buyerIdentity.sacContract,amount:'100000'});
const packetPath='C:/synthetic-private/workspace-v1.dpapi',storeDirectory=existingBuyerStoreDirectory(packetPath,ownerId,wallet);
const plan={planHash:'a'.repeat(64),sourceSha:'b'.repeat(40),participants:[{role:'seller'},{role:'buyer',ownerId,wallet}],orders:newIds.map(operationId=>({operationId}))};
const consent={authorization:'OWNER_AUTHORIZED_TWO_NEW_TESTNET_PAYMENTS',planHash:plan.planHash,sourceSha:plan.sourceSha,maximumPayments:2,totalAtomic:'200000',operationIds:newIds};
function fixture(){let state,held=false,lostAck=false,base={sha256:'c'.repeat(64),reservations:oldIds.map(reservation)};const store={
  async read(){return state&&structuredClone(state);},async write(_name,value,{createOnly=false}={}){if(createOnly&&state!==undefined)throw Error('ALREADY_EXISTS');state=structuredClone(value);if(lostAck){lostAck=false;throw Error('LOST_ACK');}},
  async acquireLock(){if(held)throw Error('STORE_LOCKED');held=true;return async()=>{held=false;};}};
  return {store,loadBase:async()=>structuredClone(base),setBase:value=>{base=value;},loseNextAck:()=>{lostAck=true;},state:()=>structuredClone(state),editState:fn=>{fn(state);}};}
const options=f=>({...f,storeDirectory,historicalPacketPath:packetPath,plan,consent});
let checks=0;
{
  const f=fixture(),ledger=await openExistingBuyerSpendLedger(options(f));assert.equal(ledger.snapshot().maximumAtomic,'400000');assert.deepEqual(ledger.snapshot().reservations,oldIds.map(reservation));
  await assert.rejects(openExistingBuyerSpendLedger(options(f)),/STORE_LOCKED/);await ledger.reserve(reservation(newIds[0]));await ledger.close();
  const reopened=await openExistingBuyerSpendLedger(options(f));assert.equal(reopened.snapshot().reservations.length,3);assert.equal(f.state().increases.length,1);
  await assert.rejects(reopened.reserve(reservation(newIds[0])),/ALREADY_EXISTS/);await reopened.reserve(reservation(newIds[1]));assert.equal(reopened.snapshot().reservations.length,4);await reopened.close();
  const again=await openExistingBuyerSpendLedger(options(f));assert.equal(again.snapshot().reservations.length,4);assert.equal(f.state().maximumAtomic,'400000');await again.close();checks+=8;
}
{
  const f=fixture(),ledger=await openExistingBuyerSpendLedger(options(f));f.setBase({sha256:'d'.repeat(64),reservations:oldIds.map(reservation)});
  await assert.rejects(ledger.reserve(reservation(newIds[0])),/SPEND_JOURNAL_UNCERTAIN/);assert.deepEqual(f.state().reservations,oldIds.map(reservation));await assert.rejects(ledger.reserve(reservation(newIds[1])),/SPEND_JOURNAL_UNCERTAIN/);await ledger.close();checks+=3;
}
{
  const f=fixture(),ledger=await openExistingBuyerSpendLedger(options(f));f.loseNextAck();await assert.rejects(ledger.reserve(reservation(newIds[0])),/SPEND_JOURNAL_UNCERTAIN/);
  assert.equal(f.state().reservations.length,3);await assert.rejects(ledger.reserve(reservation(newIds[1])),/SPEND_JOURNAL_UNCERTAIN/);await ledger.close();
  const reopened=await openExistingBuyerSpendLedger(options(f));assert.equal(reopened.snapshot().reservations.length,3);await assert.rejects(reopened.reserve(reservation(newIds[0])),/ALREADY_EXISTS/);await reopened.close();checks+=5;
}
{
  const f=fixture(),ledger=await openExistingBuyerSpendLedger(options(f));await ledger.close();f.editState(s=>{s.reservations.shift();});
  await assert.rejects(openExistingBuyerSpendLedger(options(f)),/EXISTING_SPEND_LEDGER_CHANGED/);checks++;
}
{
  const f=fixture(),ledger=await openExistingBuyerSpendLedger(options(f));await ledger.close();const altered={...consent,planHash:'e'.repeat(64)},alteredPlan={...plan,planHash:altered.planHash};
  await assert.rejects(openExistingBuyerSpendLedger({...options(f),plan:alteredPlan,consent:altered}),/EXISTING_SPEND_LEDGER_CHANGED/);assert.equal(f.state().increases.length,1);checks+=2;
}
{
  let loads=0;await assert.rejects(createExistingOpenPrivateRuntime({plan,authorization:{},controller:{snapshot:()=>({})},index:0,
    loadHistoricalPacket:async()=>{loads++;},readHistoricalFileHash:async()=>{loads++;}}));assert.equal(loads,0);checks++;
}
console.log(JSON.stringify({status:'PASS_EXISTING_OWNER_SPEND_EXTENSION_LOCAL',checks,oldReservationsConserved:2,newReservationMaximum:2,maximumAtomic:'400000',incrementOnce:'200000',baseHashRequired:true,scope:'Synthetic memory store; portable encryption/fsync verified separately. No packet, credentials, network, wallet or funds accessed.',remoteRequests:0,realPayments:0,sourceHash:openHash({ownerId,wallet,newIds})}));
