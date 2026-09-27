import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url)), require=createRequire(import.meta.url);
import {buyerAcceptanceCard} from './buyer-acceptance-fixture.mjs';
const primaryCard=buyerAcceptanceCard();
export const recipient=primaryCard.payment.destination;
export const fixtures=[primaryCard,{...structuredClone(primaryCard),id:'buyer-review-pagination',name:'Synthetic sandbox pagination'}].map(card=>({sourceCard:card,...card,provider:card.provider.name,input:card.input.map(i=>i.name),output:['data']}));
// Real route/server, ranking, serialization and SDK; only catalog/storage/history boundaries substituted.
function loadRoute(state){
 const cache=new Map();
 function load(file){
  file=path.resolve(file); if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const req=name=>{
   if(name==='./catalog')return {services:fixtures};
   if(name==='./dynamic-registry'||name==='./dynamic-registry.ts')return {readDynamicServiceCards:async()=>({available:state.available,entries:[]})};
   if(name==='./pilot-cards')return {pilotCards:[],pilotSearchServices:[],pilotCapabilityCard:{mode:'read-only'}};
   if(name==='@/app/api/operations/route')return {GET:()=>Response.json({code:'HISTORY_UNAUTHORIZED'},{status:401})};
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
 const state={available},route=loadRoute(state),requests=[];
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
 return {url:`http://127.0.0.1:${server.address().port}/api/mcp`,state,requests,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await startReviewServer({port:3214});console.log(`Synthetic read-only MCP review: ${server.url}`);
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
}

