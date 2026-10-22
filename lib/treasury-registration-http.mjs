// Existing registration URL; administrative profile requires a separate operator.
const HEADERS={'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const need=(value,code,status=400)=>{if(!value)throw Object.assign(Error(code),{status});};
export function treasuryRegistrationOperator(request){const token=request.headers.get('x-bazaar-operator');return /^[A-Za-z0-9_-]{43}$/.test(token??'')?new Request(request.url,{method:'POST',headers:{authorization:'Bearer '+token}}):null;}
export async function parseTreasuryRegistrationBody(request){
 need(request.headers.get('content-type')?.split(';')[0].trim()==='application/json','INVALID_CONTENT_TYPE',415);
 const length=request.headers.get('content-length');need(length===null||/^\d{1,4}$/.test(length)&&Number(length)<=512,'REQUEST_TOO_LARGE',413);
 const reader=request.clone().body?.getReader();need(reader,'INVALID_REQUEST');let timer,size=0,done=false;const chunks=[];
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('REQUEST_TIMEOUT'),{status:408})),3000);});
 try{for(;;){need(!request.signal.aborted,'REQUEST_ABORTED');const part=await Promise.race([reader.read(),timeout]);if(part.done){done=true;break;}size+=part.value.byteLength;need(size<=512,'REQUEST_TOO_LARGE',413);chunks.push(part.value);}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{need(false,'INVALID_REQUEST');}
  need(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')==='agentAccessHash,creationId,humanAccessHash'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.creationId)&&/^[a-f0-9]{64}$/.test(value.humanAccessHash)&&/^[a-f0-9]{64}$/.test(value.agentAccessHash),'INVALID_REQUEST');return value;
 }finally{clearTimeout(timer);if(!done)void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createTreasuryRegistrationHandler({enabled=false,operatorMatches,assertRequest,ingress,createWorkspace,bearerHash,trustedIp,creationOpen}={}){
 return async request=>{try{
  need(enabled===true,'TREASURY_REGISTRATION_DISABLED',503);const url=new URL(request.url);need(request.method==='POST'&&url.pathname==='/api/workspaces'&&!url.search&&!url.hash&&request.headers.get('x-bazaar-treasury-registration')==='1','INVALID_REQUEST');
  const operator=treasuryRegistrationOperator(request);need(operator&&operatorMatches(operator)===true,'UNAUTHORIZED',401);
  assertRequest(request);const input=await parseTreasuryRegistrationBody(request),bootstrapHash=bearerHash(request.headers.get('authorization'));
  await ingress(request);need(await creationOpen(),'ADMISSIONS_PAUSED',503);
  const result=await createWorkspace(input,bootstrapHash,trustedIp(request),operator);
  return Response.json({version:'1',...result,financialActionsEnabled:false,commissionEnabled:false},{status:result.created?201:200,headers:HEADERS});
 }catch(e){const code=/^[A-Z0-9_]{1,96}$/.test(e.message??'')?e.message:'TREASURY_REGISTRATION_UNAVAILABLE';return Response.json({error:{code},financialActionsEnabled:false},{status:e.status??503,headers:HEADERS});}};
}
