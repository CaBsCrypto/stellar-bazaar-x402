import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';

const deployment='https://stellar-bazaar-x402-ge8feauei-cabscryptocontacto-6028s-projects.vercel.app';
const candidate='094ca7e7a5a68bd6a8998c3ce7cefb6935057bf5';
const cli='C:/Users/MGC/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
// Fixed deployment and read-only MCP methods. No account credential, order,
// payment, provider execution or configuration mutation is accepted as input.
async function probe(body){return await new Promise(resolve=>{
 const args=[cli,'curl','/api/mcp','--deployment',deployment,'--scope','cabscryptocontacto-6028s-projects','--','--silent','--show-error','--max-time','20','--write-out','\nBAZAAR_HTTP_STATUS:%{http_code}','--header','Accept: application/json, text/event-stream'];
 if(body)args.push('--request','POST','--header','Content-Type: application/json','--header','MCP-Protocol-Version: 2025-03-26','--data-binary','@-');
 let out='',bytes=0;const child=spawn(process.execPath,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const timer=setTimeout(()=>child.kill(),30000);
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576)child.kill();else out+=chunk;});
 child.stderr.resume();child.stdin.end(body?JSON.stringify(body):'');
 child.on('error',()=>{clearTimeout(timer);resolve({status:null});});
 child.on('close',()=>{
  clearTimeout(timer);const match=out.match(/\nBAZAAR_HTTP_STATUS:(\d+)/);const status=match?Number(match[1]):null;
  const raw=out.split('\nBAZAAR_HTTP_STATUS:')[0];let value;
  try{value=JSON.parse(raw);}catch{try{value=JSON.parse(raw.split('\n').filter(v=>v.startsWith('data: ')).map(v=>v.slice(6)).join(''));}catch{}}
  resolve({status,value});
 });
});}
function toolBody(response){
 const tool=response.value?.result;if(tool?.isError)return undefined;
 if(tool?.structuredContent)return tool.structuredContent;
 try{return JSON.parse(tool?.content?.find(v=>v.type==='text')?.text);}catch{return undefined;}
}
const checks=[];
const meta=await probe();checks.push({name:'metadata',status:meta.status,version:meta.value?.version,pass:meta.status===200&&meta.value?.version==='1.0.0'});
const init=await probe({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'hackathon-readonly-probe',version:'1'}}});
checks.push({name:'initialize',status:init.status,version:init.value?.result?.serverInfo?.version,pass:init.status===200&&init.value?.result?.serverInfo?.version==='1.0.0'});
const list=await probe({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
const names=list.value?.result?.tools?.map(v=>v.name)??[];
const requiredTools=['submit_market_service','create_market_order','claim_market_order','get_market_delivery'].every(n=>names.includes(n));
checks.push({name:'tools/list',status:list.status,count:names.length,requiredTools,pass:list.status===200&&names.length===34&&requiredTools});
const caps=await probe({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_bazaar_capabilities',arguments:{}}});
const cb=toolBody(caps);
checks.push({name:'capabilities',status:caps.status,demoEnabled:cb?.demo?.enabled,network:cb?.demo?.network,walletRequiredForNewOrders:cb?.demo?.walletRequiredForNewOrders,pass:caps.status===200&&cb?.demo?.enabled===true&&cb?.demo?.network==='stellar:testnet'});
const cat=await probe({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'list_market_services',arguments:{}}});
const catalog=toolBody(cat);
checks.push({name:'catalog',status:cat.status,count:Array.isArray(catalog?.services)?catalog.services.length:null,pass:cat.status===200&&Array.isArray(catalog?.services)});
const evidence={version:1,observedAt:new Date().toISOString(),candidate,deployment,
 access:'Vercel CLI operator protection bypass; not public external-client acceptance',
 requestAttempts:5,requestsWithHttpResponse:checks.filter(v=>v.status!==null).length,
 authenticatedAccountAccess:false,newAccounts:0,newOrders:0,transactions:0,providerExecutions:0,configurationChanges:0,
 checks,status:checks.every(v=>v.pass)?'PASS':'FAIL'};
await writeFile('docs/evidence/hackathon-preview-readonly-2026-10-09.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));if(evidence.status!=='PASS')process.exitCode=1;
