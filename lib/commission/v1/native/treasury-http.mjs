// Private administrative binding only; no order/payment/seller operations.
const PATH='/api/market/split-v1/treasury-binding';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const need=(ok,code,status=400)=>{if(!ok)throw Object.assign(Error(code),{status});};
export function treasuryOperatorRequest(request){const value=request.headers.get('x-bazaar-operator');if(!/^[A-Za-z0-9_-]{43}$/.test(value??''))return null;return new Request(request.url,{method:request.method,headers:{authorization:'Bearer '+value}});}
export function createTreasuryHttpHandlers({authenticate,operatorMatches,store,enabled=false}={}){
 need(typeof authenticate==='function'&&typeof operatorMatches==='function','TREASURY_HTTP_NOT_CONFIGURED',503);
 const wrap=fn=>async request=>{try{
  need(enabled===true,'TREASURY_BINDING_DISABLED',503);const url=new URL(request.url);need(url.pathname===PATH&&!url.search&&!url.hash&&['GET','POST'].includes(request.method),'INVALID_REQUEST');
  const operator=treasuryOperatorRequest(request);need(operator&&operatorMatches(operator)===true,'UNAUTHORIZED',401);
  const p=await authenticate(request,'human',false);need(p?.role==='human'&&/^ow_[a-f0-9]{32}$/.test(p.ownerId)&&Number.isSafeInteger(p.generation)&&p.generation>0,'UNAUTHORIZED',401);need(store&&typeof store.bind==='function'&&typeof store.readCurrent==='function','TREASURY_BINDING_UNAVAILABLE',503);
  return Response.json(await fn(request,p,operator),{headers});
 }catch(e){const code=/^[A-Z0-9_]{1,96}$/.test(e.message??'')?e.message:'TREASURY_BINDING_UNAVAILABLE';return Response.json({error:{code},financialActionsEnabled:false},{status:e.status??503,headers});}};
 async function body(request){
  need(request.headers.get('content-type')?.split(';')[0].trim()==='application/json','INVALID_CONTENT_TYPE',415);const length=request.headers.get('content-length');need(length===null||/^\d{1,4}$/.test(length)&&Number(length)<=512,'REQUEST_TOO_LARGE',413);
  const reader=request.body?.getReader();need(reader,'INVALID_REQUEST');let timer,done=false,size=0;const chunks=[];const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('REQUEST_TIMEOUT'),{status:408})),3000);});
  try{for(;;){need(!request.signal.aborted,'REQUEST_ABORTED');const part=await Promise.race([reader.read(),deadline]);if(part.done){done=true;break;}size+=part.value.byteLength;need(size<=512,'REQUEST_TOO_LARGE',413);chunks.push(part.value);}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{need(false,'INVALID_REQUEST');}
   need(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')==='changeId,expectedRevision,recoveryAcknowledged'&&value.recoveryAcknowledged===true,'INVALID_REQUEST');return value;
  }finally{clearTimeout(timer);if(!done)void reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 function view(binding){return {version:'bazaar.treasury-binding/v1',treasury:binding?{account:binding.account,network:binding.network,ownerId:binding.ownerId,generation:binding.generation,revision:binding.revision,walletIdentityVerified:true,recoveryAcknowledgedAt:binding.ownerRecoveryAcknowledgedAt}:null,receivingRevalidated:false,financialActionsEnabled:false,commissionEnabled:false};}
 async function revalidate(request,p){const current=await authenticate(request,'human',false);need(current.role==='human'&&current.ownerId===p.ownerId&&current.generation===p.generation&&current.workspaceId===p.workspaceId&&current.agentId===p.agentId,'UNAUTHORIZED',401);return current;}
 return Object.freeze({GET:wrap(async(request,p)=>{need(request.method==='GET'&&!request.body&&!request.headers.has('transfer-encoding')&&[null,'0'].includes(request.headers.get('content-length')),'INVALID_REQUEST');const row=await store.readCurrent({refreshChain:false});need(!row||row.binding.ownerId===p.ownerId&&row.binding.generation===p.generation,'NOT_FOUND',404);await revalidate(request,p);return view(row?.binding);}),POST:wrap(async(request,p,operator)=>{need(request.method==='POST','INVALID_REQUEST');const value=await body(request);const current=await revalidate(request,p);const result=await store.bind({principal:current,...value,operatorRequest:operator});return {...view(result.binding),created:result.created,receivingRevalidated:result.chainRevalidated===true};})});
}
