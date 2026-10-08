import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openPortableSecretStore} from './buyer-portable-secret-store.mjs';
import {readPrivateInput} from './buyer-private-input.mjs';
import {defaultBuyerOrigin,configureBuyerRuntime,createPortableBuyerRuntime,increaseBuyerBudget,parseBuyerBudget,summarizeBuyerIntent,readBuyerMarketHistory} from './buyer-portable-runtime.mjs';
import {createBoundedBuyerFetch,createMarketplaceBuyerIntent,discoverBuyerService,runMarketplaceBuyerIntent,inspectBuyerOrder,recoverBuyerIntent} from './marketplace-x402-buyer.mjs';
import {originOnly} from './private-mcp-client.mjs';

const commands=['configure','access','signer','discover','prepare','buy','inspect','recover','budget','budget-increase','history'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function inputs(command,pipe){
 if(pipe){const raw=await readPrivateInput({allowPipe:true});try{const value=JSON.parse(raw);if(!value||typeof value.password!=='string'||['configure','access'].includes(command)&&typeof value.agentAccess!=='string'||['configure','signer'].includes(command)&&typeof value.stellarSecret!=='string')throw Error('INVALID_PRIVATE_INPUT');return {password:value.password,...(['configure','access'].includes(command)?{agentAccess:value.agentAccess}:{}),...(['configure','signer'].includes(command)?{stellarSecret:value.stellarSecret}:{})};}finally{raw.fill(0);}}
 const read=async prompt=>{const bytes=await readPrivateInput({prompt});try{return bytes.toString('utf8');}finally{bytes.fill(0);}};
 return {password:await read('Store passphrase (12+ bytes): '),...(['configure','access'].includes(command)?{agentAccess:await read('Agent access: ')}:{}),...(['configure','signer'].includes(command)?{stellarSecret:await read('Stellar testnet signer seed: ')}:{})};
}
export async function main(argv=process.argv.slice(2)){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('NODE_22_REQUIRED');
 const args=[...argv],pipe=args.includes('--secret-stdin');if(pipe)args.splice(args.indexOf('--secret-stdin'),1);let origin=defaultBuyerOrigin;const at=args.indexOf('--origin');if(at>=0){origin=originOnly(args[at+1]);args.splice(at,2);}let maxAtomic='100000';const maxAt=args.indexOf('--max-price');if(maxAt>=0){maxAtomic=parseBuyerBudget(args[maxAt+1]);args.splice(maxAt,2);}if(args.some(arg=>arg.startsWith('--')))throw Error('INVALID_OPTION');
 const [command,directory,arg,extra]=args;if(!commands.includes(command))throw Error('Use configure, access, signer, discover, prepare, buy, inspect, recover, budget, budget-increase or history.');
 if(maxAt>=0&&command!=='prepare')throw Error('MAX_PRICE_PREPARE_ONLY');
 if(command==='discover'){
  if(args.length>3||pipe||arg&&!directory)throw Error('INVALID_COMMAND');const marketFetch=createBoundedBuyerFetch({origin});
  if(directory){console.log(JSON.stringify(await discoverBuyerService(origin,directory,{marketFetch,catalogCursor:arg})));return;}
  const response=await marketFetch(new URL('/api/market/catalog',origin),{method:'GET',redirect:'error'});if(!response.ok)throw Error('CATALOG_UNCONFIRMED');console.log(JSON.stringify(await response.json()));return;
 }
 const sizes={configure:[2,2],access:[2,2],signer:[2,2],prepare:[4,4],buy:[3,3],inspect:[3,3],recover:[3,3],budget:[2,2],'budget-increase':[3,3],history:[2,4]};
 if(!directory||args.length<sizes[command][0]||args.length>sizes[command][1]||command!=='configure'&&at>=0)throw Error('INVALID_COMMAND');
 if(['buy','inspect','recover'].includes(command)&&(!uuid.test(arg??'')||extra))throw Error('OPERATION_ID_REQUIRED');
 if(command==='prepare'&&(!arg||!extra))throw Error('PREPARE_REQUIRES_SERVICE_AND_PUBLIC_INPUT_JSON');
 const privateInput=await inputs(command,pipe),password=Buffer.from(privateInput.password);delete privateInput.password;let store,release,runtime;
 try{
  store=await openPortableSecretStore({directory:resolve(directory),password,create:command==='configure'});password.fill(0);
  if(command!=='inspect'&&command!=='budget'&&command!=='history')release=await store.acquireLock('buyer');
  let result;
  if(command==='configure')result=await configureBuyerRuntime({store,origin,...privateInput});
  else if(command==='access'||command==='signer'){const old=await store.read('buyer-config');result=await configureBuyerRuntime({store,...old,...privateInput});}
  else if(command==='budget-increase')result=await increaseBuyerBudget({store,maximumAtomic:parseBuyerBudget(arg)});
  else{
   runtime=await createPortableBuyerRuntime({store,operationId:['buy','inspect','recover'].includes(command)?arg:undefined});
   if(command==='prepare'){
    const bytes=await readFile(resolve(extra));if(bytes.length>65536)throw Error('PUBLIC_INPUT_TOO_LARGE');const input=JSON.parse(bytes),service=await discoverBuyerService(runtime.origin,arg,runtime);const intent=createMarketplaceBuyerIntent({origin:runtime.origin,card:service.card,input,payer:runtime.payer,operationId:randomUUID(),maxAtomic});await store.journal('buyer.'+intent.operationId).initialize(intent);result=summarizeBuyerIntent(intent);
   }else if(command==='budget'){const budget=runtime.budgetSnapshot();result={maximumAtomic:budget.maximumAtomic,reservedAtomic:budget.reservations.reduce((sum,item)=>sum+BigInt(item.amount),0n).toString(),reservations:budget.reservations.length};}
   else if(command==='history'){result=await readBuyerMarketHistory(runtime,{limit:arg===undefined?10:Number(arg),cursor:extra});}
   else{const intent=await runtime.journal.read();if(command==='buy')await runMarketplaceBuyerIntent(intent,runtime);else if(command==='recover')await recoverBuyerIntent(intent,runtime);else intent.order=await inspectBuyerOrder(intent,runtime);result=summarizeBuyerIntent(intent);}
  }
  console.log(JSON.stringify({ok:true,...result}));
 }finally{password.fill(0);delete privateInput.stellarSecret;delete privateInput.agentAccess;runtime?.dispose();await release?.();store?.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({ok:false,code:error.publicCode??(/^[A-Z][A-Z0-9_]{1,80}$/.test(error.message)?error.message:'BUYER_COMMAND_UNCONFIRMED'),next:'Preserve encrypted store and operationId. Inspect or recover by reading; never regenerate authorization or repost payment after uncertainty.'}));process.exitCode=1;});
