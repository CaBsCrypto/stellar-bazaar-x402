import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve,sep,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Keypair,Networks,TransactionBuilder} from '@stellar/stellar-sdk';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {validateReviewState} from '../lib/provider-self-listing.ts';

// This helper blocks all external fetch. Domain proof and ledger are explicit doubles.
const ui=process.argv.includes('--ui-review'),sha=v=>createHash('sha256').update(v).digest('hex');
const directory=await mkdtemp(join(tmpdir(),'bazaar-market-native-double-')),suffix=randomBytes(16).toString('hex');
const prefix='bazaar-market:pilot-'+suffix,wsPrefix='bazaar-workspace:pilot-'+suffix,reviewPrefix='bazaar-review:pilot-'+suffix;
const identities=Array.from({length:2},(_,i)=>Object.fromEntries(['bootstrap','human','agent'].map((role,j)=>[role,ui?String.fromCharCode(97+i*3+j).repeat(43):randomBytes(32).toString('base64url')])));
const operator=ui?'z'.repeat(43):randomBytes(32).toString('base64url'),payer=Keypair.random(),destination=Keypair.random().publicKey();
const data=new Map(),indexes=new Map(),transactions=new Map();let child,client,redisRequests=0,redisCommands=0,ledgerRequests=0,appRequests=0,meteredRequests=0,failure;
const storeSource=await readFile('lib/workspace-store.ts','utf8');
const scripts=Object.fromEntries(['READ','COMMIT'].map(k=>[k,storeSource.match(new RegExp(`export const ${k}_WORKSPACE_LUA = \x60([\\s\\S]*?)\x60;`))[1].replaceAll('\r\n','\n')]));
const relay=createServer(async(req,res)=>{
 try{
  const chunks=[];let bytes=0;for await(const part of req){bytes+=part.length;assert.ok(bytes<=1048576);chunks.push(part);}const body=Buffer.concat(chunks).toString();let result;
  if(req.url.startsWith('/horizon/')){
   assert.ok(++ledgerRequests<=20);const path=req.url.slice('/horizon'.length);
   if(path.startsWith('/accounts/'))result={sequence:'0'};
   else if(path==='/transactions'){const tx=TransactionBuilder.fromXDR(new URLSearchParams(body).get('tx'),Networks.TESTNET),hash=tx.hash().toString('hex');transactions.set(hash,{hash,successful:true,envelope_xdr:tx.toXDR()});result={hash};}
   else {result=transactions.get(path.split('/').pop());assert.ok(result);}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));return;
  }
  assert.equal(req.headers.authorization,'Bearer local-double-only');assert.ok(++redisRequests<=1500);
  const command=JSON.parse(body),name=command[0];redisCommands++;
  if(name==='get')result=data.get(command[1])??null;
  else if(name==='smembers')result=[...(indexes.get(command[1])??[])];
  else if(name==='mget')result=command.slice(1).map(k=>data.get(k)??null);
  else{
   assert.equal(name,'eval');const script=command[1],count=Number(command[2]),keys=command.slice(3,3+count),args=command.slice(3+count);assert.ok(keys.every(k=>[prefix,wsPrefix,reviewPrefix].some(p=>k.startsWith(p+':'))));
   if(script===scripts.READ){result=keys.map(k=>data.get(k)??'');redisCommands+=3;}
   else if(script===scripts.COMMIT){result=keys.some((k,i)=>(data.get(k)??'')!==args[i])?0:1;if(result){data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');}redisCommands+=6;}
   else if(script.includes("redis.call('EXISTS'")){result=data.has(keys[0])?0:1;if(result){data.set(keys[0],args[0]);const set=indexes.get(keys[1])??new Set();set.add(args[1]);indexes.set(keys[1],set);}redisCommands+=3;}
   else if(script.includes('card.withdrawn=true')){const value=data.get(keys[0]);result=value?1:0;if(value)data.set(keys[0],JSON.stringify({...JSON.parse(value),withdrawn:true}));redisCommands+=2;}
   else {const old=data.get(keys[0]);result=(args[0]==='missing'?old!==undefined:old!==args[1])?0:1;if(result)data.set(keys[0],args[2]);redisCommands+=2;}
  }
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({result}));
 }catch(e){failure='DOUBLE_REJECTED';console.error('Local double rejected request path: '+req.url);res.writeHead(503);res.end('{"error":"DOUBLE_REJECTED"}');}
});
await new Promise(done=>relay.listen(0,'127.0.0.1',done));const relayOrigin='http://127.0.0.1:'+relay.address().port;
const adapter=join(directory,'adapter.mjs');await writeFile(adapter,`const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(u.origin==='https://redis-double.invalid')return original(${JSON.stringify(relayOrigin)}+u.pathname,init);if(u.origin==='https://horizon-testnet.stellar.org')return original(${JSON.stringify(relayOrigin)}+'/horizon'+u.pathname,init);throw Error('EXTERNAL_FETCH_DISABLED');};`);
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--import='+pathToFileURL(adapter).href,
 BAZAAR_ACCEPTANCE_METER:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:ui?'file':'redis',BAZAAR_WORKSPACE_PREFIX:wsPrefix,BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://pilot.example',BAZAAR_WORKSPACE_ADMISSION:'invite-only',BAZAAR_WORKSPACE_INVITE_HASHES_JSON:JSON.stringify(identities.map(v=>sha(v.bootstrap))),BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE:'120',BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY:'1000',BAZAAR_WORKSPACE_REDIS_REST_URL:'https://redis-double.invalid',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:'local-double-only',
 BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_MARKET_PREFIX:prefix,BAZAAR_DYNAMIC_PREFIX:prefix+':catalog',BAZAAR_MARKET_REVIEW_SECRET:randomBytes(32).toString('hex'),BAZAAR_MARKET_OPERATOR_HASH:sha(operator),BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_REVIEW_PREFIX:reviewPrefix,BAZAAR_REVIEW_REDIS_REST_URL:'https://redis-double.invalid',BAZAAR_REVIEW_REDIS_REST_TOKEN:'local-double-only',BAZAAR_ENABLE_PROVIDER_ACTIVATION:'true',X402_PILOT_PAYMENTS_ENABLED:'false',X402_LEGACY_PAYMENTS_ENABLED:'false'});
const port=3280,origin='http://127.0.0.1:'+port;
if(ui){env.BAZAAR_WORKSPACE_FILE_DIRECTORY=join(directory,'workspace');env.BAZAAR_WORKSPACE_LOCAL_ORIGIN=origin;}
const server=join(directory,'server.mjs');await writeFile(server,`import next from ${JSON.stringify(pathToFileURL(resolve('node_modules/next/dist/server/next.js')).href)};import{createServer}from'node:http';const app=next({dev:false,dir:${JSON.stringify(process.cwd())},hostname:${JSON.stringify(ui?'127.0.0.1':'pilot.example')},port:${ui?port:443}});await app.prepare();createServer(app.getRequestHandler()).listen(${port},'127.0.0.1',()=>console.log('Ready'));`);
async function start(){child=spawn(process.execPath,[server],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);const deadline=Date.now()+20000;while(!logs.includes('Ready')){if(child.exitCode!==null||Date.now()>deadline)throw Error('NEXT_NOT_READY: '+logs.slice(-1000));await new Promise(done=>setTimeout(done,100));}}
async function stop(){if(child&&child.exitCode===null){child.kill();await new Promise(done=>child.once('exit',done));}}
async function appFetch(input,init={}){assert.ok(++appRequests<=150);const headers=new Headers(init.headers);if(!ui){headers.set('host','pilot.example');headers.set('x-forwarded-host','pilot.example');headers.set('x-forwarded-proto','https');}const response=await fetch(input,{...init,headers,redirect:'error',signal:AbortSignal.timeout(10000)});assert.equal(response.headers.get('x-bazaar-acceptance-meter'),'v1');assert.equal(response.headers.get('x-bazaar-redis-uncertain'),'false');meteredRequests+=Number(response.headers.get('x-bazaar-redis-requests'));return response;}
async function http(path,token,body,expected=200){const r=await appFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));assert.equal(r.headers.get('cache-control'),'private, no-store');return value;}
try{
 await start();const receipts=[],creationIntents=identities.map(v=>({creationId:randomUUID(),humanAccessHash:sha(v.human),agentAccessHash:sha(v.agent)}));for(const [i,v] of identities.entries())receipts.push((await http('/api/workspaces',v.bootstrap,creationIntents[i],201)).record);
 const card={version:'bazaar.service-card/v0',id:'native-market-text',name:'Native text fixture',description:'Synthetic local seller, domain and ledger evidence are doubles.',kind:'http',url:'https://provider.example.com',routeTemplate:'/text',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'XLM',amount:'0.01',destination},provider:{name:'Synthetic external agent'},tags:['fixture','testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
 const submissionId=randomUUID();await http('/api/market/services',identities[0].human,{submissionId,card,controlProof:{method:'http-well-known',domain:'provider.example.com'}},201);
 // Only the control-proof observation is seeded. Review and activation execute native HTTP.
 const envelope=JSON.parse(data.get(reviewPrefix+':state')),submission=envelope.state.records[0].submission;
 submission.control.status='verified';submission.control.evidence={observedAt:new Date().toISOString(),source:'http-well-known',challengeHash:sha(submission.control.expectedRecord),cardHash:computeCanonicalServiceCardHash(card)};submission.status='pending-manual-review';validateReviewState(envelope.state);data.set(reviewPrefix+':state',JSON.stringify(envelope));
 await http('/api/market/review',operator,{submissionId,action:'approve',reason:'Local synthetic contract fixture; not real domain verification'});await http('/api/market/review',operator,{submissionId,action:'activate'});
 const catalog=await http('/api/market/services',identities[1].human);assert.equal(catalog.services.length,1);
 const operationId=randomUUID(),intent={operationId,serviceId:card.id,cardHash:computeCanonicalServiceCardHash(card),payer:payer.publicKey(),input:{topic:'Preserve native text'}};
 await http('/api/market/orders',identities[1].human,intent,201);await http('/api/market/orders',identities[1].human,intent,201);
 const draft=(await http('/api/market/orders/'+operationId,identities[1].human,{action:'prepare'})).payment,tx=TransactionBuilder.fromXDR(draft.unsignedXdr,Networks.TESTNET);tx.sign(payer);await http('/api/market/orders/'+operationId,identities[1].human,{action:'pay',signedXdr:tx.toXDR()});
 client=new Client({name:'external-market-seller',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/api/mcp'),{requestInit:{headers:{authorization:'Bearer '+identities[0].agent}},fetch:appFetch,reconnectionOptions:{maxRetries:0}}));
 const names=(await client.listTools()).tools.map(v=>v.name);assert.ok(names.includes('deliver_market_order'));
 const attemptId=randomUUID();for(const [name,args] of [['claim_market_order',{operationId,attemptId}],['deliver_market_order',{operationId,attemptId,text:'Exact native seller text'}],['deliver_market_order',{operationId,attemptId,text:'Exact native seller text'}]]){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));}
 const original=(await http('/api/market/orders/'+operationId,identities[1].human)).order;assert.equal(original.phase,'delivered');assert.equal(original.delivery.text,'Exact native seller text');
 await client.close();client=undefined;await stop();await start();assert.deepEqual((await http('/api/market/orders/'+operationId,identities[1].human)).order,original);
 await http('/api/market/orders/'+operationId,'q'.repeat(43),undefined,401);
 if(ui){console.log(JSON.stringify({reviewReady:true,url:origin+'/history',access:'e'.repeat(43),scope:'LOCAL PUBLIC DUMMY TOKEN ONLY; file workspace + Redis and ledger doubles; no external requests'}));await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});}
 else {
  await http('/api/market/control',operator,{action:'pause'});await stop();await start();await http('/api/market/orders',identities[1].human,{...intent,operationId:randomUUID()},503);await http('/api/workspaces',identities[0].bootstrap,{...creationIntents[0],creationId:randomUUID()},503);await http('/api/workspaces',identities[0].bootstrap,creationIntents[0]);assert.deepEqual((await http('/api/market/orders/'+operationId,identities[1].human)).order,original);
  env.BAZAAR_ENABLE_MARKET_PURCHASES='false';env.BAZAAR_ENABLE_SELF_LISTING_INTAKE='false';await stop();await start();await http('/api/market/orders',identities[1].human,{...intent,operationId:randomUUID()},503);assert.deepEqual((await http('/api/market/orders/'+operationId,identities[1].human)).order,original);
  assert.equal(failure,undefined);assert.equal(meteredRequests,redisRequests);const report={status:'PASS',buildId:(await readFile('.next/BUILD_ID','utf8')).trim(),runtime:process.version,nativeNext:true,externalMcpClient:true,serverMeterMatchesProtocol:true,appRequests,redisRequests,redisCommands,ledgerRequests,externalRequests:0,domainProof:'seeded protocol double only',payment:'native HTTP signed transaction with local Horizon double; no funds moved',storage:'configured Redis SDK redirected to protocol double; no real durability proof',processReplacement:true,purchasePausePreservesHistory:true,deliveryExact:true};await mkdir('docs/evidence/sprint-marketplace',{recursive:true});await writeFile('docs/evidence/sprint-marketplace/native-local.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}finally{await client?.close();await stop();relay.closeAllConnections();await new Promise(done=>relay.close(done));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep)&&basename(directory).startsWith('bazaar-market-native-double-'));await rm(directory,{recursive:true,force:true});}
