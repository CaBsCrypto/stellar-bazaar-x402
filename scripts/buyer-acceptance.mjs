import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { encodePaymentRequiredHeader } from '@x402/core/http';
// Remove inherited service credentials/configuration before importing application code.
// Enumerate names only: never inspect or print the inherited values.
for (const key of Object.keys(process.env)) {
 if (/^(X402_|STELLAR_|BAZAAR_|UPSTASH_|KV_|NEXT_PUBLIC_X402_)/.test(key) || key === 'VERCEL') delete process.env[key];
}
process.env.NODE_ENV = 'test';
globalThis.fetch = async () => { throw Error('OUTBOUND_NETWORK_DISABLED'); };
const { BazaarAgentClient } = await import('../lib/bazaar-agent-client.ts');
const { FilePaymentJournal, paymentBinding } = await import('../lib/pilot-payment-store.ts');
const { buyerAcceptanceCard } = await import('./buyer-acceptance-fixture.mjs');
const { handleSandboxPayment } = await import('../lib/sandbox-payment-handler.ts');
const { generateHistoryKeypair, authenticateHistory } = await import('../lib/operation-history-auth.ts');
const { createHistoryHandlers } = await import('../lib/operation-history-http.ts');
const { createHistoryStore } = await import('../lib/operation-history-store.ts');

// This executable has no live mode. Never load dotenv, wallet files or a network client.
globalThis.fetch = async () => { throw Error('OUTBOUND_NETWORK_DISABLED'); };
const [command,...args]=process.argv.slice(2), flags={};
for(let i=0;i<args.length;i++) {
 const key=args[i];
 if(!['--dir','--operation','--asset','--budget','--fault','--no-history'].includes(key)||key in flags)throw Error('INVALID_ARGUMENT');
 flags[key]=key==='--no-history'?true:args[++i];
}
let counters={signatures:0,settlements:0};
const emit=value=>console.log(JSON.stringify({simulation:true,realPayments:0,counters,...value}));
try {
 if(!flags['--dir'])throw Error('ISOLATED_DIRECTORY_REQUIRED');
 const dir=resolve(flags['--dir']), statePath=join(dir,'simulation.json');
 if(command==='prepare') {
  await mkdir(dir,{recursive:false,mode:0o700});
  const alice=generateHistoryKeypair('synthetic-buyer'),bob=generateHistoryKeypair('synthetic-other');
  await writeFile(statePath,JSON.stringify({kind:'buyer-acceptance-v1',alice,bob,counters,hashes:{},indexes:{}}),{flag:'wx',mode:0o600});
  emit({ok:true,prepared:true,directory:dir});
 } else {
  if(!['buy','recover'].includes(command))throw Error('COMMAND_REQUIRED: prepare, buy, recover');
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(flags['--operation']??''))throw Error('OPERATION_ID_REQUIRED: 8-128 safe characters');
  if(!['USDC','XLM'].includes(flags['--asset']))throw Error('EXPLICIT_ASSET_REQUIRED');
  if(!/^\d+(\.\d{1,7})?$/.test(flags['--budget']??''))throw Error('EXPLICIT_BUDGET_REQUIRED');
  if(flags['--fault']&&!['history','uncertain','tamper','signer','funds'].includes(flags['--fault']))throw Error('UNKNOWN_FAULT');
  const lockPath=join(dir,'session.lock');
  let lock;try{lock=await open(lockPath,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw Error('PAYMENT_PENDING: session locked; never remove automatically');throw e}
  let state;
  try {
   state=JSON.parse(await readFile(statePath,'utf8'));if(state.kind!=='buyer-acceptance-v1')throw Error('INVALID_SIMULATION_DIRECTORY');
   counters=state.counters;
   const payer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,71)),seller=Keypair.fromRawEd25519Seed(Buffer.alloc(32,72)).publicKey();
   const card=buyerAcceptanceCard();
   const operationId=flags['--operation'];
   if(command==='recover') {
    const prior=JSON.parse(await readFile(join(dir,'buyer',paymentBinding(operationId)+'.json'),'utf8').catch(e=>{if(e.code==='ENOENT')throw Error('NO_OPERATION_TO_RECOVER');throw e}));
    if(!prior.response&&!prior.outcome)throw Error('PAYMENT_PENDING: uncertainty requires reconciliation; never pay again');
   }
   const config=JSON.stringify([state.alice,state.bob].map(({ownerId,readTokenHash,writeTokenHash})=>({ownerId,readTokenHash,writeTokenHash})));
   const redis={async eval(_script,[key,index],[id,digest,entry]){
    // Prove delivery is durable before any history write.
    const prior=JSON.parse(await readFile(join(dir,'buyer',paymentBinding(operationId)+'.json'),'utf8'));
    if(!prior.response||!prior.outcome)throw Error('RESPONSE_NOT_DURABLE');
    if(flags['--fault']==='history')throw Error('SIMULATED_HISTORY_OUTAGE');
    const records=state.hashes[key]??={};if(records[id])return [JSON.parse(records[id]).digest===digest?'existing':'conflict',records[id]];
    records[id]=entry;(state.indexes[index]??=[]).unshift(id);return ['created',entry];
   },async lrange(key,start,stop){return(state.indexes[key]??[]).slice(start,stop+1)},async hmget(key,...fields){return Object.fromEntries(fields.map(f=>[f,state.hashes[key]?.[f]]))}};
   const handlers=createHistoryHandlers({authenticate:(authorization,write)=>authenticateHistory(authorization,write,config),store:()=>createHistoryStore(redis)});
   const deps={config:()=>({seller,apiKey:'synthetic'}),pilot:()=>true,payments:()=>true,directory:()=>join(dir,'provider'),facilitator:()=>({verify:async()=>({isValid:true,payer:payer.publicKey()}),settle:async()=>{counters.settlements++;return {success:true,network:'stellar:testnet',transaction:'a'.repeat(64),payer:payer.publicKey()}}})};
   ExactStellarScheme.prototype.createPaymentPayload=async()=>{counters.signatures++;return {x402Version:2,payload:{simulatedAuthorization:true}}};
   globalThis.fetch=async(url,init)=>{
    const request=new Request(url,init),parsed=new URL(request.url);
    if(parsed.origin!==card.url)throw Error('OUTBOUND_NETWORK_DISABLED');
    if(parsed.pathname==='/api/operations')return handlers[request.method](request);
    if(parsed.pathname!=='/api/x402/swap-risk')throw Error('OUTBOUND_NETWORK_DISABLED');
    const response=await handleSandboxPayment(request,deps);
    if(response.status===200&&flags['--fault']==='uncertain')throw Error('SIMULATED_RESPONSE_LOST_AFTER_SETTLEMENT');
    if(response.status===402&&flags['--fault']==='tamper'){const body=await response.json();body.accepts.forEach(o=>o.amount='999999');return Response.json(body,{status:402,headers:{'payment-required':encodePaymentRequiredHeader(body)}})}
    return response;
   };
   const client=new BazaarAgentClient({baseUrl:card.url,payerSecretKey:flags['--fault']==='signer'?undefined:payer.secret(),allowedAssets:[flags['--asset']],maxAmountByAsset:{[flags['--asset']]:flags['--budget']},paymentJournal:new FilePaymentJournal(join(dir,'buyer')),readBalances:async()=>flags['--fault']==='funds'?({USDC:'0',XLM:'0'}):({USDC:'100000',XLM:'1000000'}),receiptVerifier:()=>true,...(flags['--no-history']?{}:{history:{writeToken:state.alice.writeToken,includeResult:true,mode:'fixture'}})});
   const outcome=await client.executeService(card,{pair:'XLM/USDC',amount:2500,side:'buy'},{operationId,preferredAsset:flags['--asset']});
   const own=await (await handlers.GET(new Request(card.url+'/api/operations',{headers:{Authorization:`Bearer ${state.alice.readToken}`}}))).json();
   const other=await (await handlers.GET(new Request(card.url+'/api/operations',{headers:{Authorization:`Bearer ${state.bob.readToken}`}}))).json();
   emit({ok:true,operationId,outcome,historyRecords:own.records,otherOwnerRecords:other.records,humanHistoryLink:null});
  } finally {
   if(state)await writeFile(statePath,JSON.stringify(state),{mode:0o600});
   await lock.close();await unlink(lockPath);
  }
 }
} catch(e){emit({ok:false,error:e.message});process.exitCode=1}
