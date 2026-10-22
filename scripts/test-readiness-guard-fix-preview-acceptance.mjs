import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {buyerCanonical,buyerIdentity,buyerProtocol} from '../examples/marketplace-x402-buyer.mjs';
import {runFixPreviewUnpaidAcceptance,fixAcceptanceMcpBody,validateFixAcceptancePrivate,validateFixAcceptanceAuthority} from '../.vercel/readiness-guard-fix-preview-acceptance.mjs';
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},throws=(fn,code)=>{assert.throws(fn,new RegExp(code));checks++;},sha=s=>createHash('sha256').update(s).digest('hex'),clone=structuredClone;
const plan={planHash:'a'.repeat(64),reviewHash:'b'.repeat(64),source:{sourceDigest:'c'.repeat(64),manifestSha256:'d'.repeat(64),candidate:'offline-corrective'},projectId:'prj_offline',accountFingerprint:'e'.repeat(64),provider:{sourceDigest:'f'.repeat(64)}};
const deployment={status:'READINESS_GUARD_FIX_READY',...plan,sourceDigest:plan.source.sourceDigest,manifestSha256:plan.source.manifestSha256,deploymentId:'dpl_OfflineCorrective',url:'https://stellar-bazaar-x402-offline.vercel.app',readyState:'READY',target:'preview',crons:[],generalPurchasesEnabled:false,restrictedUnpaidAcceptanceEnabled:true,syntheticAccountFingerprint:plan.accountFingerprint,newPayments:0,productionChanged:false};
const waf={status:'PASS_EXACT_READINESS_GUARD_FIX_PREVIEW_WAF',sourceDigest:deployment.sourceDigest,deploymentId:deployment.deploymentId,url:deployment.url,reviewHash:deployment.reviewHash,temporaryMcpExceptionActive:true,protectionPreserved:true,originalSsoPreserved:true,productionChanged:false,newPayments:0};
eq(validateFixAcceptanceAuthority(plan,deployment,waf),true);
for(const field of ['sourceDigest','manifestSha256','planHash','reviewHash','projectId','target','syntheticAccountFingerprint'])throws(()=>validateFixAcceptanceAuthority(plan,{...deployment,[field]:'wrong'},waf),'EXACT_READY');
for(const field of ['generalPurchasesEnabled','productionChanged'])throws(()=>validateFixAcceptanceAuthority(plan,{...deployment,[field]:true},waf),'EXACT_READY');
for(const field of ['restrictedUnpaidAcceptanceEnabled'])throws(()=>validateFixAcceptanceAuthority(plan,{...deployment,[field]:false},waf),'EXACT_READY');
throws(()=>validateFixAcceptanceAuthority(plan,{...deployment,crons:[{path:'/tick'}]},waf),'EXACT_READY');
for(const field of ['temporaryMcpExceptionActive','protectionPreserved','originalSsoPreserved'])throws(()=>validateFixAcceptanceAuthority(plan,deployment,{...waf,[field]:false}),'EXACT_READY');
for(const field of ['deploymentId','url','sourceDigest','reviewHash'])throws(()=>validateFixAcceptanceAuthority(plan,deployment,{...waf,[field]:'wrong'}),'EXACT_READY');
throws(()=>validateFixAcceptanceAuthority(plan,deployment,{...waf,newPayments:1}),'EXACT_READY');
const seller=Keypair.fromRawEd25519Seed(Buffer.alloc(32,23)).publicKey();
const card={id:'guionista-bazaar-pilot-text-funded-v1',url:'https://provider.example',routeTemplate:'/v1/marketplace-text',network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.01',destination:seller,identity:buyerIdentity,marketplace:{protocol:buyerProtocol,resourceTemplate:'/api/market/orders/{operationId}/x402'}}};
const privatePacket={card,cardHash:sha(buyerCanonical(card)),protection:'synthetic-protection-value-only',a:{ownerId:'ow_'+'11'.repeat(16),agentId:'agent_'+'11'.repeat(16),generation:1,agent:'A'.repeat(43)},b:{ownerId:'ow_'+'22'.repeat(16),agentId:'agent_'+'22'.repeat(16),generation:1,agent:'B'.repeat(43)}};
throws(()=>validateFixAcceptancePrivate(privatePacket),'EXACT_EXISTING_TWO');
for(const change of [{cardHash:'0'.repeat(64)},{protection:'x'},{protection:'synthetic\nvalue'},{extra:true},{card:{...card,network:'stellar:mainnet'}}])throws(()=>validateFixAcceptancePrivate({...clone(privatePacket),...change}),'ORIGINAL_SYNTHETIC');
eq(fixAcceptanceMcpBody({structuredContent:{httpStatus:200,ok:true}}),{httpStatus:200,ok:true});
eq(fixAcceptanceMcpBody({content:[{type:'text',text:'{"httpStatus":201}'}]}),{httpStatus:201});
for(const code of ['CAPACITY_WRITE_UNCONFIRMED','SELLER_UNAVAILABLE','PURCHASES_PAUSED','SERVICE_NOT_ACTIVE','UNAUTHORIZED','NOT_FOUND','WORKSPACE_RATE_LIMIT']){try{fixAcceptanceMcpBody({isError:true,structuredContent:{httpStatus:409,error:{code}}});assert.fail('expected rejection');}catch(e){eq(e.message,code);eq(e.safeHttpStatus,409);}}
throws(()=>fixAcceptanceMcpBody({isError:true,structuredContent:{error:{code:'raw secret error'}}}),'MCP_TOOL_UNCONFIRMED');
throws(()=>fixAcceptanceMcpBody({structuredContent:[]}), 'MCP_RESULT_SCHEMA');
function fixture(change={}){
 let sealed,order,creates=0,requests=0;const snapshots=[],events=[],calls=[];
 const journal={read:async()=>{if(!sealed){const e=Error('missing');e.code='ENOENT';throw e;}return clone(sealed);},initialize:async v=>{assert.equal(sealed,undefined);sealed=clone(v);events.push('initialized');},append:async v=>{sealed=clone(v);snapshots.push(clone(v));events.push(v.phase);}};
 const fetcher=async(url,init)=>{requests++;const u=new URL(url),h=new Headers(init.headers);calls.push({url,method:init.method??'GET'});eq(init.redirect,'error');eq(init.credentials,'omit');eq(h.get('x-vercel-protection-bypass'),privatePacket.protection);assert(!u.pathname.endsWith('/x402'));
  if(u.pathname==='/api/mcp'){
   const p=JSON.parse(init.body),label=h.get('authorization')==='Bearer '+privatePacket.a.agent?'a':'b';let result;
   if(p.method==='tools/list')result={tools:Array.from({length:35},(_,i)=>({name:'fixture_'+i}))};
   else if(p.params.name==='get_bazaar_identity')result={httpStatus:200,ownerId:privatePacket[label].ownerId,agentId:privatePacket[label].agentId,generation:1};
   else if(p.params.name==='get_bazaar_capabilities')result={demo:{network:'stellar:testnet'},workspace:{marketplace:{admission:{mode:'restricted'}}},effectiveFeatures:{purchases:{enabled:label==='a'},privateFiles:{enabled:false}}};
   else if(p.params.name==='get_service')result={status:'activated',cardHash:privatePacket.cardHash,resource:card};
   else if(p.params.name==='create_market_order'){
    creates++;eq(sealed.phase,'order-started');eq(events.includes('initialized'),true);const a=p.params.arguments;order={...clone(a),serviceId:card.id,card:clone(card),inputHash:sha(buyerCanonical(a.input)),destination:seller,settlement:buyerIdentity,amount:'0.01',buyerOwnerId:privatePacket.a.ownerId,createdAt:'2026-10-12T00:00:00.000Z',memoHash:'7'.repeat(64),phase:'awaiting-payment'};
    if(change.createError)throw Error(change.createError);result={httpStatus:201,order};
   }else assert.fail('Unexpected tool');
   return Response.json(result);
  }
  if(u.pathname.startsWith('/api/market/orders/')){if(h.get('authorization')==='Bearer '+privatePacket.b.agent)return change.bLeak?Response.json({order}):Response.json({error:{code:'NOT_FOUND'}},{status:404});return Response.json({order:{...order,...(change.order??{})}});}
  if(u.pathname==='/api/market/catalog')return Response.json({services:[{card,cardHash:privatePacket.cardHash}]});
  if(u.pathname.endsWith('/qr.svg'))return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>',{headers:{'content-type':'image/svg+xml'}});
  assert.fail('Unexpected target');
 };
 const clientFactory=async(label,send)=>{const auth={authorization:'Bearer '+privatePacket[label].agent,'content-type':'application/json'},request=async(method,params)=>{const r=await send(deployment.url+'/api/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return r.json();};return {list:async()=>{if(label==='a'&&change.attack)await change.attack(send,auth);return request('tools/list');},tool:(name,args={})=>request('tools/call',{name,arguments:args})};};
 return {journal,fetcher,clientFactory,snapshots,events,calls,get sealed(){return sealed;},get creates(){return creates;},get requests(){return requests;},run:()=>runFixPreviewUnpaidAcceptance({plan,deployment,privatePacket:clone(privatePacket),journal,fetcher,clientFactory,validatePrivate:p=>eq(p,privatePacket)})};
}
const good=fixture(),first=await good.run();eq(first.evidence.status,'PASS_READINESS_GUARD_FIX_PROTECTED_PREVIEW');eq(first.evidence.newPayments,0);eq(first.evidence.signatures,0);eq(first.evidence.providerExecutions,0);eq(good.creates,1);eq(first.evidence.creationRequestsThisRun,1);eq(first.evidence.privateIsolationVerified,true);eq(first.evidence.requestLog.some(r=>r.path.includes(good.sealed.operationId)),false);eq(good.calls.some(r=>r.url.includes('/x402')),false);
const sameOp=good.sealed.operationId,second=await good.run();eq(second.evidence.status,'PASS_READINESS_GUARD_FIX_PROTECTED_PREVIEW');eq(good.creates,1);eq(good.sealed.operationId,sameOp);eq(second.evidence.creationRequestsThisRun,0);
const lost=fixture({createError:'CAPACITY_WRITE_UNCONFIRMED'}),uncertain=await lost.run();eq(uncertain.evidence.status,'UNCONFIRMED');eq(uncertain.evidence.code,'CAPACITY_WRITE_UNCONFIRMED');eq(lost.sealed.phase,'order-uncertain');const recovered=await lost.run();eq(recovered.evidence.status,'PASS_READINESS_GUARD_FIX_PROTECTED_PREVIEW');eq(lost.creates,1);eq(recovered.evidence.creationRequestsThisRun,0);
for(const order of [{buyerOwnerId:privatePacket.b.ownerId},{amount:'0.02'},{payer:seller},{cardHash:'0'.repeat(64)},{input:{topic:'different'}},{phase:'paid'},{transactionHash:'9'.repeat(64)},{delivery:{text:'unexpected'}},{attemptId:'unexpected'}]){const f=fixture({order}),r=await f.run();eq(r.evidence.status,'UNCONFIRMED');eq(f.creates,1);eq(r.evidence.newPayments,0);}
const leak=fixture({bLeak:true});eq((await leak.run()).evidence.code,'OTHER_BUYER_ORDER_ISOLATION');
const attacks=[
 async(send,h)=>send(deployment.url+'/api/market/orders/not-an-operation/x402',{method:'POST',headers:h,body:'{}'}),
 async(send,h)=>send('https://foreign.invalid/api/mcp',{method:'POST',headers:h,body:'{}'}),
 async(send,h)=>send(deployment.url+'/api/mcp',{method:'POST',headers:h,body:JSON.stringify({method:'tools/call',params:{name:'get_market_order',arguments:{}}})}),
 async(send)=>send(deployment.url+'/api/mcp',{method:'GET'}),
 async(send,h)=>{for(let n=0;n<25;n++)await send(deployment.url+'/api/mcp',{method:'POST',headers:h,body:JSON.stringify({method:'tools/list'})});}
];
for(const attack of attacks){const f=fixture({attack}),r=await f.run();eq(r.evidence.status,'UNCONFIRMED');eq(f.creates,0);eq(f.requests<=24,true);eq(r.evidence.newPayments,0);}
const responseLeak=fixture();const unsafe=await runFixPreviewUnpaidAcceptance({plan,deployment,privatePacket,journal:responseLeak.journal,clientFactory:responseLeak.clientFactory,validatePrivate:()=>true,fetcher:async()=>new Response(privatePacket.a.agent)});eq(unsafe.evidence.code,'SECRET_IN_ACCEPTANCE_RESPONSE');
console.log(JSON.stringify({status:'PASS_OFFLINE_READINESS_GUARD_FIX_PREVIEW_ACCEPTANCE',checks,networkRequests:0,dpapiReads:0,newPayments:0,signatures:0,providerExecutions:0}));
