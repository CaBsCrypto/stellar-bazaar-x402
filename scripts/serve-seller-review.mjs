// Local synthetic acceptance bridge. Real routes/services; DNS and registry storage are doubles.
// Static catalog/pilots are empty and unrelated private history is denied for isolation.
// Reserved static IDs and deployment registry configuration are covered by separate suites.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url)), require=createRequire(import.meta.url);
export async function startSellerReview({directory,port=0}={}) {
  if(!directory||!path.isAbsolute(directory))throw Error('An absolute isolated review directory is required');
  // Never read deployment credentials, env files, or real registry storage.
  for(const key of Object.keys(process.env))if(/UPSTASH|^KV_|SECRET|FACILITATOR|^VERCEL/.test(key))delete process.env[key];
  process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE='true';
  process.env.BAZAAR_PROVIDER_REVIEW_DIR=directory;
  process.env.X402_PILOT_PAYMENTS_ENABLED='false';
  const listing=await import('../lib/provider-self-listing.ts');
  const operator=await import('../lib/provider-review-operator.ts');
  const {computeCanonicalServiceCardHash}=await import('../lib/canonical-service-card.ts');
  fs.mkdirSync(directory,{recursive:true});
  const registryFile=path.join(directory,'synthetic-registry.json');
  const entries=()=>fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')):[];
  const registry={
    storageMode:()=> 'upstash', // Only the adapter mode; no Redis client exists in this bridge.
    isReservedServiceId:()=>false,
    getDynamicServiceCard:async id=>entries().find(entry=>entry.id===id),
    readDynamicServiceCards:async()=>({available:true,entries:entries()}),
    createDynamicServiceCard:async(card,providerKeyHash)=>{
      const current=entries();if(current.some(entry=>entry.id===card.id))return {exists:true};
      const now=new Date().toISOString();
      const entry={id:card.id,hash:computeCanonicalServiceCardHash(card),card,providerKeyHash,revision:1,registeredAt:now,updatedAt:now};
      fs.writeFileSync(registryFile,JSON.stringify([...current,entry]));return {entry};
    },
  };
  const cache=new Map();
  const fixtureKey='synthetic-local-registry-key';
  function load(file){
    file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
    const m={exports:{}};cache.set(file,m);
    const req=name=>{
      const base=name.replace(/\.ts$/,'').split('/').at(-1);
      if(base==='provider-self-listing')return listing;
      if(base==='dynamic-registry')return registry;
      if(base==='catalog')return {services:[],getService:()=>undefined};
      if(base==='pilot-cards')return {pilotCards:[],pilotSearchServices:[],pilotCapabilityCard:{mode:'read-only'}};
      if(name==='@/app/api/operations/route')return {GET:async()=>Response.json({ok:false,error:{code:'UNAUTHORIZED'}},{status:401})};
      if(name.startsWith('.')||name.startsWith('@/')){let p=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(p))p+='.ts';return load(p);}
      return require(name);
    };
    const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    vm.runInNewContext(compiled,{module:m,exports:m.exports,require:req,process:{env:{...process.env,BAZAAR_PROVIDER_SECRET:fixtureKey,BAZAAR_ENABLE_REGISTRY_MUTATIONS:'true'}},console,Buffer,URL,Request,Response,Headers,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,TextEncoder,TextDecoder,fetch:()=>{throw Error('External fetch forbidden');}},{filename:file});
    return m.exports;
  }
  const ingest=load(path.join(root,'lib/service-ingest.ts'));
  const activation={configured:ingest.registryMutationConfigured,create:card=>ingest.createService(card,fixtureKey),read:registry.getDynamicServiceCard};
  const routes={
    '/api/provider-self-listing':load(path.join(root,'app/api/provider-self-listing/route.ts')),
    '/api/discovery/resources':load(path.join(root,'app/api/discovery/resources/route.ts')),
    '/api/discovery/search':load(path.join(root,'app/api/discovery/search/route.ts')),
    '/api/mcp':load(path.join(root,'app/api/mcp/route.ts')),
  };
  const statusRoute=load(path.join(root,'app/api/provider-self-listing/[id]/route.ts'));
  const {NextRequest}=require('next/server');
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,`http://127.0.0.1:${server.address().port}`);
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks);
      const request=new NextRequest(url,{method:req.method,headers:req.headers,...(body.length?{body,duplex:'half'}:{})});
      let response;
      // Test-only operator transport; never mounted by the application.
      if(url.pathname==='/__fixture/operator'&&req.method==='POST'){
        if(req.headers.authorization!=='Bearer synthetic-local-operator')response=Response.json({ok:false},{status:401});
        else{
          const input=JSON.parse(body.toString());let result;
          if(input.action==='verify')result=await operator.verifySubmissionDns(input.id,{resolveTxt:async hostname=>{if(hostname!=='api.seller.example.com')throw Error('Unexpected DNS fixture domain');return [[input.txt??'wrong-proof']];}});
          else if(input.action==='review')result=await listing.recordManualReview(input.id,{decision:input.decision??'approve',reviewerId:'synthetic-operator',reasons:['Synthetic local conformance review']});
          else if(input.action==='stage')result=await listing.stageApprovedSubmission(input.id);
          else if(input.action==='activate')result=await operator.activateSubmission(input.id,activation);
          else throw Error('Unknown fixture action');
          response=Response.json(result);
        }
      }else if(url.pathname.startsWith('/api/provider-self-listing/')&&req.method==='GET')response=await statusRoute.GET(request,{params:Promise.resolve({id:url.pathname.split('/').at(-1)})});
      else if(routes[url.pathname]?.[req.method])response=await routes[url.pathname][req.method](request);
      else response=new Response(null,{status:404});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.argv.find(arg=>arg.startsWith('--directory='))?.slice(12);
  const server=await startSellerReview({directory});
  console.log(JSON.stringify({ready:true,url:server.url,pid:process.pid}));
  process.on('message',async message=>{if(message==='close'){await server.close();process.exit(0);}});
}
