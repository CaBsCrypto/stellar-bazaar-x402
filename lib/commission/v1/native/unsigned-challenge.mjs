/** Soroban recording simulation only. This module has no signing or send port. */
import {Account,Address,Networks,Operation,StrKey,TransactionBuilder,xdr,nativeToScVal,scValToNative} from '@stellar/stellar-sdk';
import {assertPolicy,hashPolicy} from '../policy-router/fee-split-policy-v1.mjs';
import {expectedCall,expectedFunc} from '../channels-adapter/adapter.mjs';
import {pinPreparationServerBinding,createBoundPreparationRpc,assertVerifiedContractContext} from './contract-context.mjs';

const need=(ok,code)=>{if(!ok)throw Error(code);};
const uint=v=>Number.isSafeInteger(v)&&v>0&&v<=0xffffffff;
function decode(value,kind,max){
 need(typeof value==='string'&&value.length>0&&value.length<=Math.ceil(max/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(value),'NATIVE_UNSIGNED_XDR_INVALID');
 let item;try{item=kind.fromXDR(value,'base64');}catch{throw Error('NATIVE_UNSIGNED_XDR_INVALID');}
 need(item.toXDR('base64')===value,'NATIVE_UNSIGNED_XDR_NONCANONICAL');return item;
}
function transfer(inv,policy,destination,amount){
 need(inv.function().switch().name==='sorobanAuthorizedFunctionTypeContractFn'&&inv.subInvocations().length===0,'NATIVE_UNSIGNED_AUTH_TREE');
 const fn=inv.function().contractFn(),args=fn.args();
 need(Address.fromScAddress(fn.contractAddress()).toString()===policy.asset&&fn.functionName().toString()==='transfer'&&args.length===3&&args[0].switch().name==='scvAddress'&&args[1].switch().name==='scvAddress'&&args[2].switch().name==='scvI128'&&scValToNative(args[0])===policy.payer&&scValToNative(args[1])===destination&&scValToNative(args[2])===BigInt(amount),'NATIVE_UNSIGNED_AUTH_TREE');
}
export function validateUnsignedAuthorization(policy,encoded,context){
 assertPolicy(policy);
 const entry=decode(encoded,xdr.SorobanAuthorizationEntry,24000),root=entry.rootInvocation();
 need(entry.credentials().switch().name==='sorobanCredentialsAddress'&&root.function().switch().name==='sorobanAuthorizedFunctionTypeContractFn'&&root.function().contractFn().toXDR('base64')===expectedCall(policy).toXDR('base64'),'NATIVE_UNSIGNED_AUTH_ROOT');
 need(root.subInvocations().length===2,'NATIVE_UNSIGNED_AUTH_TREE');transfer(root.subInvocations()[0],policy,policy.provider,policy.sellerNetAtomic);transfer(root.subInvocations()[1],policy,policy.treasury,policy.feeAtomic);
 const credentials=entry.credentials().address();
 need(Address.fromScAddress(credentials.address()).toString()===policy.payer&&credentials.nonce().toBigInt()>=0n,'NATIVE_UNSIGNED_AUTH_PAYER');
 need(credentials.signature().switch().name==='scvVoid','NATIVE_UNSIGNED_SIGNATURE_FORBIDDEN');
 need(uint(context.currentLedger)&&context.currentLedger<=0xffffffff-15,'NATIVE_UNSIGNED_LEDGER_INVALID');
 need(credentials.signatureExpirationLedger()===0,'NATIVE_UNSIGNED_SIMULATION_EXPIRY');
 credentials.signatureExpirationLedger(context.currentLedger+15);
 return entry.toXDR('base64');
}

export function createUnsignedChallengePreparer({serverBinding,fetcher,authorizeRpcRequest,assertBinding,sourceAccountForBinding,now=Date.now}={}){
 const server=pinPreparationServerBinding(serverBinding);
 need(typeof sourceAccountForBinding==='function','NATIVE_UNSIGNED_SOURCE_AUTHORITY_REQUIRED');
 return async function prepareVerifiedChallenge({capability,policy,context}={}){
  const p=Object.freeze(structuredClone(policy));assertPolicy(p,{nowSeconds:Math.floor(now()/1000)});
  assertVerifiedContractContext(context,{serverBinding:server,capability,policy:p,now});
  const rpc=createBoundPreparationRpc({serverBinding:server,capability,policy:p,purpose:'unsigned-challenge',fetcher,authorizeRpcRequest,assertBinding,now});
  await rpc.assertCurrent();
  const source=await sourceAccountForBinding({capability,policy:p});
  need(source&&Object.keys(source).sort().join('|')==='accountId|policyHash|sourceDigest'&&typeof source.accountId==='string'&&StrKey.isValidEd25519PublicKey(source.accountId)&&source.accountId===p.payer&&source.policyHash===hashPolicy(p)&&source.sourceDigest===server.sourceDigest,'NATIVE_UNSIGNED_SOURCE_AUTHORITY_REQUIRED');
  const sourceId=source.accountId;await rpc.assertCurrent();
  const key=xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:new Address(sourceId).toScAddress().accountId()})).toXDR('base64');
  const result=await rpc.request('getLedgerEntries',{keys:[key],xdrFormat:'base64'});
  need(uint(result.latestLedger)&&result.latestLedger>=context.currentLedger&&result.latestLedger<=context.currentLedger+3&&Array.isArray(result.entries)&&result.entries.length===1,'NATIVE_UNSIGNED_SOURCE_LEDGER');
  const row=result.entries[0];need(row?.key===key&&uint(row.lastModifiedLedgerSeq)&&row.lastModifiedLedgerSeq<=result.latestLedger,'NATIVE_UNSIGNED_SOURCE_MISSING');
  const data=decode(row.xdr,xdr.LedgerEntryData,16384);need(data.switch().name==='account'&&StrKey.encodeEd25519PublicKey(data.account().accountId().ed25519())===sourceId,'NATIVE_UNSIGNED_SOURCE_MISMATCH');
  const sequence=data.account().seqNum().toString();need(/^(0|[1-9][0-9]*)$/.test(sequence)&&BigInt(sequence)<9223372036854775807n,'NATIVE_UNSIGNED_SOURCE_SEQUENCE');
  assertVerifiedContractContext(context,{serverBinding:server,capability,policy:p,now});
  const transaction=new TransactionBuilder(new Account(sourceId,sequence),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func:xdr.HostFunction.hostFunctionTypeInvokeContract(expectedCall(p)),auth:[]})).setTimebounds(0,p.expiresAt).build();
  need(transaction.signatures.length===0&&transaction.operations.length===1&&transaction.operations[0].type==='invokeHostFunction'&&transaction.operations[0].func.toXDR('base64')===expectedFunc(p),'NATIVE_UNSIGNED_TRANSACTION_INVALID');
  const simulation=await rpc.request('simulateTransaction',{transaction:transaction.toXDR(),authMode:'record',xdrFormat:'base64'});
  need(!Object.hasOwn(simulation,'error')&&!Object.hasOwn(simulation,'restorePreamble')&&uint(simulation.latestLedger)&&simulation.latestLedger>=result.latestLedger&&simulation.latestLedger<=context.currentLedger+3&&typeof simulation.minResourceFee==='string'&&/^(0|[1-9][0-9]*)$/.test(simulation.minResourceFee)&&simulation.minResourceFee.length<=20,'NATIVE_UNSIGNED_SIMULATION_REJECTED');
  need(Array.isArray(simulation.results)&&simulation.results.length===1&&Array.isArray(simulation.results[0].auth)&&simulation.results[0].auth.length===1,'NATIVE_UNSIGNED_SIMULATION_AUTH');
  decode(simulation.transactionData,xdr.SorobanTransactionData,65536);
  const retval=decode(simulation.results[0].xdr,xdr.ScVal,4096),wanted=xdr.ScVal.scvVec([nativeToScVal(BigInt(p.sellerNetAtomic),{type:'i128'}),nativeToScVal(BigInt(p.feeAtomic),{type:'i128'})]);
  need(retval.toXDR('base64')===wanted.toXDR('base64'),'NATIVE_UNSIGNED_SIMULATION_RETURN');
  const auth=validateUnsignedAuthorization(p,simulation.results[0].auth[0],{currentLedger:simulation.latestLedger});
  await rpc.assertCurrent();assertVerifiedContractContext(context,{serverBinding:server,capability,policy:p,now});
  // The canonical packet remains unsigned. Resource-fee estimates and recorded
  // auth prove neither payer authority nor an effective provider fee ceiling.
  return Object.freeze({func:expectedFunc(p),auth:Object.freeze([auth])});
 };
}
