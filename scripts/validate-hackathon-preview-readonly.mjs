import {spawn} from 'node:child_process';
import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';

const cli='C:/Users/MGC/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const safeCodes=new Set(['CONFIG_ARGUMENT_REQUIRED','ARGUMENT_NOT_ALLOWED','LOCAL_EXECUTION_REQUIRED','PRIVATE_CONFIG_PATH_REQUIRED','SYMLINK_FORBIDDEN','CONFIG_TOO_LARGE','CONFIG_JSON_INVALID','PREVIEW_DEPLOYMENT_REQUIRED','CANDIDATE_AND_DEPLOYMENT_REQUIRED','EVIDENCE_PATH_REQUIRED','EVIDENCE_ALREADY_EXISTS']);
let requestAttempts=0;
function must(condition,code){if(!condition)throw Object.assign(Error('Read-only validation stopped'),{safeCode:code});}
function contained(root,path){const local=relative(root,path);return Boolean(local)&&!isAbsolute(local)&&local!=='..'&&!local.startsWith('..'+sep);}
async function configuration(){
 must(!process.env.VERCEL&&!process.env.VERCEL_ENV,'LOCAL_EXECUTION_REQUIRED');
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){const key=args[i];must(['--config','--evidence'].includes(key)&&!Object.hasOwn(options,key)&&typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'ARGUMENT_NOT_ALLOWED');options[key]=args[i+1];}
 must(options['--config'],'CONFIG_ARGUMENT_REQUIRED');
 const privateRoot=await realpath(resolve('.vercel')),configFile=resolve(options['--config']);
 must(contained(privateRoot,configFile),'PRIVATE_CONFIG_PATH_REQUIRED');
 must((await lstat(configFile)).isFile()&&await realpath(configFile)===configFile,'SYMLINK_FORBIDDEN');
 const raw=await readFile(configFile);must(raw.length<=262144,'CONFIG_TOO_LARGE');let input;
 try{input=JSON.parse(raw);}catch{must(false,'CONFIG_JSON_INVALID');}
 // Project only these public fields. Operator tokens, overrides and saved
 // account credentials in the private configuration are never used or emitted.
 const {url:deployment,candidate,deploymentId}=input??{};let url;
 try{url=new URL(deployment);}catch{must(false,'PREVIEW_DEPLOYMENT_REQUIRED');}
 must(url.protocol==='https:'&&url.origin===deployment&&!url.username&&!url.password&&!url.search&&!url.hash&&/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(url.hostname),'PREVIEW_DEPLOYMENT_REQUIRED');
 must(/^[a-f0-9]{40}$/.test(candidate??'')&&/^dpl_[A-Za-z0-9]+$/.test(deploymentId??''),'CANDIDATE_AND_DEPLOYMENT_REQUIRED');
 const evidenceRoot=await realpath(resolve('docs/evidence')),evidenceFile=resolve(options['--evidence']??'docs/evidence/hackathon-preview-readonly-2026-10-10.json');
 must(contained(evidenceRoot,evidenceFile)&&evidenceFile.endsWith('.json')&&!evidenceFile.toLowerCase().includes('2026-10-09'),'EVIDENCE_PATH_REQUIRED');
 must(await realpath(resolve(evidenceFile,'..'))===resolve(evidenceFile,'..'),'SYMLINK_FORBIDDEN');
 try{await lstat(evidenceFile);must(false,'EVIDENCE_ALREADY_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 return {deployment,candidate,deploymentId,evidenceFile};
}
// Five fixed read-only requests. No account credential, order,
// payment, provider execution or configuration mutation is accepted as input.
async function probe({deployment},body){return await new Promise(resolve=>{
 const args=[cli,'curl','/api/mcp','--deployment',deployment,'--scope','cabscryptocontacto-6028s-projects','--','--silent','--show-error','--max-time','20','--proto','=https','--write-out','\nBAZAAR_HTTP_STATUS:%{http_code}','--header','Accept: application/json, text/event-stream'];
 if(body)args.push('--request','POST','--header','Content-Type: application/json','--header','MCP-Protocol-Version: 2025-03-26','--data-binary','@-');
 requestAttempts++;let out='',bytes=0;const child=spawn(process.execPath,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const timer=setTimeout(()=>child.kill(),30000);
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576)child.kill();else out+=chunk;});
 child.stderr.resume();child.stdin.end(body?JSON.stringify(body):'');
 child.on('error',()=>{clearTimeout(timer);resolve({status:null});});
 child.on('close',code=>{
  clearTimeout(timer);const match=out.match(/\nBAZAAR_HTTP_STATUS:(\d{3})\s*$/),observed=match?Number(match[1]):null,status=code===0&&observed>=100&&observed<=599?observed:null;
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
async function main(){
try{
const context=await configuration(),{deployment,candidate,deploymentId}=context,checks=[];
const meta=await probe(context);checks.push({name:'metadata',status:meta.status,version:meta.value?.version==='1.0.0'?'1.0.0':null,pass:meta.status===200&&meta.value?.version==='1.0.0'});
const init=await probe(context,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'hackathon-readonly-probe',version:'1'}}});
checks.push({name:'initialize',status:init.status,version:init.value?.result?.serverInfo?.version==='1.0.0'?'1.0.0':null,pass:init.status===200&&init.value?.result?.serverInfo?.version==='1.0.0'});
const list=await probe(context,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
const names=list.value?.result?.tools?.map(v=>v.name)??[];
const requiredTools=['submit_market_service','create_market_order','claim_market_order','get_market_delivery'].every(n=>names.includes(n));
checks.push({name:'tools/list',status:list.status,count:names.length,requiredTools,pass:list.status===200&&names.length===34&&requiredTools});
const caps=await probe(context,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_bazaar_capabilities',arguments:{}}});
const cb=toolBody(caps);
checks.push({name:'capabilities',status:caps.status,demoEnabled:typeof cb?.demo?.enabled==='boolean'?cb.demo.enabled:null,network:cb?.demo?.network==='stellar:testnet'?'stellar:testnet':null,walletRequiredForNewOrders:typeof cb?.demo?.walletRequiredForNewOrders==='boolean'?cb.demo.walletRequiredForNewOrders:null,pass:caps.status===200&&cb?.demo?.enabled===true&&cb?.demo?.network==='stellar:testnet'});
const cat=await probe(context,{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'list_market_services',arguments:{}}});
const catalog=toolBody(cat);
checks.push({name:'catalog',status:cat.status,count:Array.isArray(catalog?.services)?catalog.services.length:null,pass:cat.status===200&&Array.isArray(catalog?.services)});
const evidence={version:1,observedAt:new Date().toISOString(),candidate,deploymentId,deployment,
 access:'Vercel CLI operator protection bypass; not public external-client acceptance',
 requestAttempts,requestsWithHttpResponse:checks.filter(v=>v.status!==null).length,
 authenticatedAccountAccess:false,newAccounts:0,newOrders:0,transactions:0,providerExecutions:0,configurationChanges:0,
 checks,status:checks.every(v=>v.pass)?'PASS':'FAIL'};
await writeFile(context.evidenceFile,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
return evidence;
}catch(error){return {status:'FAIL',code:safeCodes.has(error.safeCode)?error.safeCode:'READ_ONLY_VALIDATION_UNCONFIRMED',requestAttempts,authenticatedAccountAccess:false,newAccounts:0,newOrders:0,transactions:0,providerExecutions:0,configurationChanges:0};}
}
const evidence=await main();console.log(JSON.stringify(evidence));if(evidence.status!=='PASS')process.exitCode=1;
