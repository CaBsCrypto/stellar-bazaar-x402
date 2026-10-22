// LOCAL ONLY: capture exact scripts from native builders with injected Redis.
// No credential, network, payment, ledger initialization or Redis mutation.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {READ_WORKSPACE_LUA,READ_CONTINUOUS_WORKSPACE_STORAGE_LUA,READ_MARKET_PERMISSION_LUA,READ_WORKSPACE_MAINTENANCE_LUA,COMMIT_WORKSPACE_LUA,COMMIT_CONTINUOUS_WORKSPACE_LUA,COMMIT_MARKET_PERMISSION_LUA} from '../lib/workspace-store.ts';
import {MARKET_CAPACITY_CAS,commitCapacityStore} from '../lib/marketplace-capacity.ts';
import {MARKET_X402_CAS} from '../lib/marketplace-x402-store.ts';
import {CONTINUOUS_FREE_BUDGET_LUA} from '../lib/continuous-free-budget.ts';
import {prepareContinuousStorageCommit} from '../lib/continuous-free-storage.ts';
import {createRedisReviewStore} from '../lib/provider-review-redis.ts';
const sha=value=>createHash('sha256').update(value).digest('hex');
export async function captureExampleBudgetCommandCatalog(){
 const names=['BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES','BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_WORKSPACE_PREFIX'];
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const prefix='bazaar-workspace:pilot-'+'a'.repeat(32),marketPrefix=prefix.replace('workspace','market'),rows=[],localScriptFixtures=[];
 const record=(category,script,keyCount,argCount,maximumRedisCommands)=>{
  // Only these native builders have been audited: loops parse JSON metadata,
  // but no redis.call sits inside a loop. The syntactic sum is their bound.
  const calls=1+(script.match(/redis\.call\s*\(/g)?.length??0);
  if(calls!==maximumRedisCommands)throw Error('AUDITED_NATIVE_SCRIPT_COMMAND_COUNT_CHANGED:'+category);
  const row={category,scriptSha256:sha(script),keyCount,argCount,maximumRedisCommands};rows.push(row);localScriptFixtures.push({...row,script});
 };
 try{
  process.env.BAZAAR_FREE_DEMO_MODE='continuous';process.env.BAZAAR_WORKSPACE_PREFIX=prefix;
  for(const name of names.filter(name=>!['BAZAAR_FREE_DEMO_MODE','BAZAAR_WORKSPACE_PREFIX'].includes(name)))delete process.env[name];
  record('workspace-read',READ_WORKSPACE_LUA,3,0,4);
  record('workspace-storage-read',READ_CONTINUOUS_WORKSPACE_STORAGE_LUA,1,0,2);
  record('permission-read',READ_MARKET_PERMISSION_LUA,4,0,5);
  record('maintenance-read',READ_WORKSPACE_MAINTENANCE_LUA,1,0,3);
  record('workspace-cas-legacy',COMMIT_WORKSPACE_LUA,3,5,7);
  record('workspace-cas-continuous',COMMIT_CONTINUOUS_WORKSPACE_LUA,4,6,8);
  record('permission-cas-legacy',COMMIT_MARKET_PERMISSION_LUA,4,5,6);
  record('continuous-budget',CONTINUOUS_FREE_BUDGET_LUA,1,2,4);
  record('settlement-cas-legacy',MARKET_X402_CAS,1,3,3);
  record('market-cas-legacy',MARKET_CAPACITY_CAS,5,14,10);
  const storage=await prepareContinuousStorageCommit({eval:async()=>{throw Error('UNEXPECTED_LOCAL_CAPTURE_EVAL');}},prefix,[]);
  if(!storage)throw Error('CONTINUOUS_STORAGE_TEMPLATE_REQUIRED');
  record('workspace-cas-storage',COMMIT_CONTINUOUS_WORKSPACE_LUA.replace("redis.call('SET', KEYS[1], ARGV[4])",storage.appendScript(5,7)+storage.writeScript(5)+"redis.call('SET', KEYS[1], ARGV[4])"),5,8,10);
  record('permission-cas-storage',COMMIT_MARKET_PERMISSION_LUA.replace("redis.call('SET',KEYS[4],ARGV[5]);",storage.appendScript(5,6)+storage.writeScript(5)+"redis.call('SET',KEYS[4],ARGV[5]);"),5,7,8);
  let captured;
  const fake={get:async()=>null,eval:async(script,keys,args)=>{captured={script,keyCount:keys.length,argCount:args.length};return 1;}};
  const review=createRedisReviewStore(fake,prefix.replace('workspace','review'),state=>{if(state?.version!==1||!Array.isArray(state.records))throw Error('CAPTURE_REVIEW_STATE');});
  await review.transact(state=>{state.records.push({});});
  record('review-cas-storage',captured.script,captured.keyCount,captured.argCount,5);
  for(let guards=0;guards<=2;guards++)for(const held of [false,true]){
   const guard={keys:Array.from({length:guards},(_,index)=>prefix+':guard-'+index),values:Array.from({length:guards},()=>null),...(held?{continuousOperation:{operationId:'11111111-1111-4111-8111-111111111111',principalHash:'b'.repeat(64),action:'reserve'}}:{})};
   await commitCapacityStore(fake,marketPrefix,'market',null,JSON.stringify({version:1,revision:'22222222-2222-4222-8222-222222222222',state:{version:1,services:[],orders:[]}}),guard);
   record(`market-joint-g${guards}-${held?'operation':'plain'}`,captured.script,captured.keyCount,captured.argCount,held?17:14);
  }
  const sourceFiles=['lib/workspace-store.ts','lib/marketplace-capacity.ts','lib/marketplace-x402-store.ts','lib/provider-review-redis.ts','lib/continuous-free-storage.ts','lib/continuous-free-budget.ts'];
  const sourceSha256=Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,sha(await readFile(new URL('../'+name,import.meta.url)))])));
  const result={version:1,rows:rows.sort((a,b)=>a.category.localeCompare(b.category)),sourceSha256,networkRequests:0,ledgerWrites:0,payments:0};
  Object.defineProperty(result,'localScriptFixtures',{value:localScriptFixtures,enumerable:false});return result;
 }finally{for(const [name,value]of Object.entries(saved))if(value===undefined)delete process.env[name];else process.env[name]=value;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const result=await captureExampleBudgetCommandCatalog();
 await writeFile(new URL('../scripts/fixtures/example-budget-command-catalog.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 if(process.argv.includes('--module'))await writeFile(new URL('../lib/example-budget-command-weight.ts',import.meta.url),renderCommandWeightModule(result.rows));
 console.log(JSON.stringify({status:'PASS_LOCAL_EXACT_NATIVE_SCRIPT_CATALOG',scripts:result.rows.length,maximumScriptCommands:Math.max(...result.rows.map(row=>row.maximumRedisCommands)),networkRequests:0,ledgerWrites:0,payments:0}));
}
export function renderCommandWeightModule(rows){return `// Generated locally by scripts/prepare-example-budget-command-catalog.mjs.
// Exact native Lua hashes: no prefix match, unreviewed script or loop discount.
import {createHash} from 'node:crypto';
import {WorkspaceError} from './workspace-types.ts';
export const EXAMPLE_BUDGET_SCRIPT_CATALOG=Object.freeze(${JSON.stringify(rows,null,1)}.map(row=>Object.freeze(row)));
const unavailable=()=>new WorkspaceError('EXAMPLE_TEXT_REDIS_SCRIPT_UNREVIEWED',503,60);
/** Includes EVAL itself and every possible redis.call in the exact reviewed
 * native script. JSON iteration in these scripts performs no Redis calls.
 * Initialization and maintenance loops are intentionally outside this list. */
export function exampleBudgetCommandDescriptor(body:unknown):{category:string;maximumRedisCommands:number;keys:string[]}{
 if(!Array.isArray(body)||typeof body[0]!=='string')throw unavailable();
 const command=body[0].toLowerCase(),key=(value:unknown)=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=512;
 if(command==='get'){if(body.length!==2||!key(body[1]))throw unavailable();return {category:'get',maximumRedisCommands:1,keys:[body[1] as string]};}
 if(command!=='eval'||typeof body[1]!=='string'||Buffer.byteLength(body[1])>65536||!['number','string'].includes(typeof body[2]))throw unavailable();
 const keyCount=Number(body[2]);if(!Number.isSafeInteger(keyCount)||keyCount<1||keyCount>8||body.slice(3,3+keyCount).some(value=>!key(value)))throw unavailable();
 const scriptSha256=createHash('sha256').update(body[1]).digest('hex'),argCount=body.length-3-keyCount;
 const match=EXAMPLE_BUDGET_SCRIPT_CATALOG.find(row=>row.scriptSha256===scriptSha256&&row.keyCount===keyCount&&row.argCount===argCount);
 if(!match||body.slice(3+keyCount).some(value=>typeof value!=='string'))throw unavailable();
 return {category:match.category,maximumRedisCommands:match.maximumRedisCommands,keys:body.slice(3,3+keyCount) as string[]};
}
export function exampleBudgetCommandWeight(body:unknown):number{return exampleBudgetCommandDescriptor(body).maximumRedisCommands;}
`;}
