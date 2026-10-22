// LOCAL ONLY. Capture the real native maintenance builder with synthetic
// documents and an acknowledgement double; never execute Lua or contact Redis.
import {createHash} from 'node:crypto';
import {createSellerCard} from '../examples/seller-service-card.mjs';
import {pruneExpiredMarketContent} from '../lib/market-maintenance.ts';
import {validateMarketState} from '../lib/marketplace-store.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {canonical,sha,orderMemo} from '../lib/marketplace-identity.ts';
import {EXAMPLE_BUDGET_SCRIPT_CATALOG} from '../lib/example-budget-command-weight.ts';
const digest=value=>createHash('sha256').update(value).digest('hex');
/** Returns only exact command descriptors publicly. Raw scripts remain an
 * in-memory, non-enumerable fixture for an independently reviewed guard. */
export async function captureGuardianCleanupCatalog(){
 const names=['BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES','BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_FILES_ENABLED'];
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]])),realFetch=globalThis.fetch;let networkRequests=0;
 globalThis.fetch=async()=>{networkRequests++;throw Error('GUARDIAN_CAPTURE_NETWORK_FORBIDDEN');};
 const family='pilot-'+'a'.repeat(32),prefix='bazaar-market:'+family,workspace='bazaar-workspace:'+family,now=Date.now(),createdAt=new Date(now-8*86400000).toISOString(),rows=[],fixtures=[];
 const payer='GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU',destination='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C';
 const {card,cardHash}=createSellerCard({id:'synthetic-guardian-catalog',name:'Synthetic guardian catalog',description:'Local source-builder capture without network or payments.',providerName:'Synthetic',providerOrigin:'https://provider.example',destination,amount:'0.01'});
 try{
  process.env.BAZAAR_FREE_DEMO_MODE='continuous';process.env.BAZAAR_WORKSPACE_PREFIX=workspace;process.env.BAZAAR_MARKET_FILES_ENABLED='false';
  for(const name of names.filter(name=>!['BAZAAR_FREE_DEMO_MODE','BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_FILES_ENABLED'].includes(name)))delete process.env[name];
  for(const phase of ['awaiting-payment','paid']){
   const operationId=phase==='paid'?'11111111-1111-4111-8111-111111111112':'11111111-1111-4111-8111-111111111111',buyerOwnerId='ow_'+'b'.repeat(32),input={prompt:'SYNTHETIC EXPIRED TEXT'};
   const order={operationId,buyerOwnerId,sellerOwnerId:'ow_'+'a'.repeat(32),serviceId:card.id,cardHash,card,input,payer,destination,amount:'0.01',settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyerOwnerId,operationId,cardHash,input),createdAt,updatedAt:createdAt,phase,...(phase==='paid'?{settlementAttemptId:'22222222-2222-4222-8222-222222222222',transactionHash:'d'.repeat(64),paymentVerifiedAt:createdAt}:{})};
   const market={version:1,services:[],orders:[order]};validateMarketState(market);
   const data=new Map([[prefix+':state',JSON.stringify({version:1,revision:'33333333-3333-4333-8333-333333333333',state:market})],[prefix+':x402-settlements:state',JSON.stringify({version:1,revision:'44444444-4444-4444-8444-444444444444',state:{version:1,records:[]}})]]),captured=[];
   const redis={get:async key=>data.get(key)??null,eval:async(script,keys,args)=>{captured.push({script,keys,args});return 1;}};
   const result=await pruneExpiredMarketContent({redis,prefix,now,limit:2});
   if(captured.length!==1||result.removed.length!==1)throw Error('GUARDIAN_SINGLE_NATIVE_CLEANUP_CAPTURE_REQUIRED');
   const {script,keys,args}=captured[0],maximumRedisCommands=1+(script.match(/redis\.call\s*\(/g)?.length??0),scriptSha256=digest(script),known=EXAMPLE_BUDGET_SCRIPT_CATALOG.some(row=>row.scriptSha256===scriptSha256&&row.keyCount===keys.length&&row.argCount===args.length);
   const row={category:phase==='paid'?'guardian-cleanup-preserve-pending-holds':'guardian-cleanup-release-definitely-unpaid',scriptSha256,keyCount:keys.length,argCount:args.length,maximumRedisCommands,maximumResponseBytes:8192,scalarResponse:true,matchedExampleCatalog:known,budgetReleaseCount:result.releasedOperationIds.length};
   rows.push(row);fixtures.push({...row,script});
  }
  if(networkRequests!==0)throw Error('GUARDIAN_LOCAL_CAPTURE_NETWORK_USED');
  const result={version:1,status:'PASS_LOCAL_NATIVE_GUARDIAN_CLEANUP_SOURCE_CAPTURE',rows,networkRequests,realRedisLua:false,ledgerWrites:0,financialSubmissions:0,productionChanges:0};Object.defineProperty(result,'localScriptFixtures',{value:fixtures,enumerable:false});return result;
 }finally{globalThis.fetch=realFetch;for(const[name,value]of Object.entries(saved))value===undefined?delete process.env[name]:process.env[name]=value;}
}
