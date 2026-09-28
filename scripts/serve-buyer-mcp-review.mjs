import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {generateHistoryKeypair,authenticateHistory} from '../lib/operation-history-auth.ts';
import {createHistoryHandlers} from '../lib/operation-history-http.ts';
import {createHistoryStore} from '../lib/operation-history-store.ts';
const root=fileURLToPath(new URL('../',import.meta.url)), require=createRequire(import.meta.url);
import {buyerAcceptanceCard} from './buyer-acceptance-fixture.mjs';
const primaryCard=buyerAcceptanceCard();
export const recipient=primaryCard.payment.destination;
export const fixtures=[primaryCard,{...structuredClone(primaryCard),id:'buyer-review-pagination',name:'Synthetic sandbox pagination'}].map(card=>({sourceCard:card,...card,provider:card.provider.name,input:card.input.map(i=>i.name),output:['data']}));
// Real route/server, ranking, serialization and SDK; only catalog/storage/history boundaries substituted.
function loadRoute(state,history){
 const cache=new Map();
 function load(file){
  file=path.resolve(file); if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const req=name=>{
   if(name==='./catalog')return {services:fixtures};
   if(name==='./dynamic-registry'||name==='./dynamic-registry.ts')return {readDynamicServiceCards:async()=>({available:state.available,entries:[]})};
   if(name==='./pilot-cards')return {pilotCards:[],pilotSearchServices:[],pilotCapabilityCard:{mode:'read-only'}};
   if(name==='@/app/api/operations/route')return {GET:history.GET};
   if(name.startsWith('.')||name.startsWith('@/')){let p=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(p))p+='.ts';return load(p);}
   return require(name);
  };
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(compiled,{module:m,exports:m.exports,require:req,process:{env:{}},console,Buffer,URL,Request,Response,Headers,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,TextEncoder,TextDecoder,fetch:()=>{throw Error('External fetch forbidden in review harness');}},{filename:file});
  return m.exports;
 }
 return load(path.join(root,'app/api/mcp/route.ts'));
}
export async function startReviewServer({port=0,available=true}={}){
 // Accounts are ephemeral and never read from environment or exposed by an endpoint.
 const owner=generateHistoryKeypair(),other=generateHistoryKeypair(),unknown=generateHistoryKeypair();
 const config=JSON.stringify([owner,other].map(({ownerId,readTokenHash,writeTokenHash})=>({ownerId,readTokenHash,writeTokenHash})));
 const records=new Map(),indexes=new Map();
 const storage={
  async eval(_script,[key,index],[id,digest,entry]){
   const entries=records.get(key)??new Map();
   if(entries.has(id))return [JSON.parse(entries.get(id)).digest===digest?'existing':'conflict',entries.get(id)];
   entries.set(id,entry);records.set(key,entries);indexes.set(index,[id,...(indexes.get(index)??[])]);return ['created',entry];
  },
  async lrange(key,start,end){return (indexes.get(key)??[]).slice(start,end+1)},
  async hmget(key,...ids){return Object.fromEntries(ids.map(id=>[id,records.get(key)?.get(id)]))},
 };
 const history=createHistoryHandlers({authenticate:(authorization,write=false)=>authenticateHistory(authorization,write,config),store:()=>createHistoryStore(storage)});
 const operation={clientOperationId:'mcp-owner-fixture',mode:'fixture',agentId:'mcp-review',service:{id:'mcp-review-result',title:'Synthetic result',provider:'Local fixture',url:'https://example.com'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient},delivery:{status:'reported-delivered',result:{summary:'Synthetic owner-only MCP result; no purchase.'}}};
 const prepared=await history.POST(new Request('http://127.0.0.1/api/operations',{method:'POST',headers:{authorization:`Bearer ${owner.writeToken}`,'content-type':'application/json'},body:JSON.stringify(operation)}));
 if(prepared.status!==201)throw Error('Synthetic history preparation failed');
 const record=(await prepared.json()).record;
 const state={available},route=loadRoute(state,history),requests=[];
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.url!=='/api/mcp'||!['GET','POST'].includes(req.method)){res.writeHead(405);res.end();return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=Buffer.concat(chunks).toString();
   requests.push({method:req.method,rpc:body?JSON.parse(body):null});
   const request=new Request(`http://127.0.0.1:${server.address().port}/api/mcp`,{method:req.method,headers:req.headers,...(body?{body}:{})});
   const response=await route[req.method](request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500);res.end(String(e.message));}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {url:`http://127.0.0.1:${server.address().port}/api/mcp`,state,requests,historyFixture:{readToken:owner.readToken,otherReadToken:other.readToken,unknownToken:unknown.readToken,record},close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await startReviewServer({port:3214});console.log(`Synthetic read-only MCP review: ${server.url}`);
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
}

