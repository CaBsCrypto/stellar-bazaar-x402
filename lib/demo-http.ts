import {demoEnabled,walletChallengeInput,walletProofInput,verifyWalletProof,assertSingleSigner,readTestnetWalletAccount} from './demo-wallet.ts';
import {authenticateWorkspaceRequest,assertWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders,workspaceRequestOrigin,trustedIp,projectedPublicIdentityRequest,prepareProjectedPublicIdentity,takeProjectedPublicIdentity,requireWorkspaceIngressPrincipal} from './workspace-http.ts';
import {requireWorkspacePrincipal} from './workspace-auth.ts';
import {adoptProjectedIdentityControlBudget} from './continuous-control-budget.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {sha} from './marketplace-identity.ts';
import {freeDemoBudgetConfiguration,configuredFreeDemoBudgetStore,classifyFreeDemoRequest} from './free-demo-budget.ts';
import {assertTreasuryControlRequest} from './treasury-control-workspace.ts';
const admitted=new WeakSet<Request>();
const admitting=new WeakMap<Request,Promise<void>>();
const mcpNested=new WeakSet<Request>();
const acceptedOperationCredits=new WeakMap<Request,{operationId:string;ownerId:string}>();
const nativeOrderId=(request:Request)=>/^\/api\/market\/orders\/([a-f0-9-]{36})(?:\/x402|\/deliveries(?:\/confirm)?)?$/.exec(new URL(request.url).pathname)?.[1];
/** New-profile credits require a native owner/generation/order CAS claim. A
 * caller UUID is only replay identification, never a source of capacity. The
 * surrounding operational/control gates still deny these financial routes. */
async function splitStageCredit(request:Request,principal:WorkspacePrincipal|undefined){
 const id=/^\/api\/market\/split-v1\/orders\/([a-f0-9-]{36})(?:\/(?:challenge|settle|reconcile|delivery))?$/.exec(new URL(request.url).pathname)?.[1];
 if(!id)return false;
 if(principal?.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 const claimId=request.headers.get('X-Bazaar-Stage-Claim');
 if(!claimId)throw new WorkspaceError('SPLIT_STAGE_CLAIM_REQUIRED',409);
 const {configuredNativeSplitComponents}=await import('./commission/v1/native/composition.ts');
 const result=await configuredNativeSplitComponents().stageAccounting.claim({principal,request,operationId:id,claimId});
 if(result.status==='unmanaged')return false;
 if(result.status!=='claimed'||result.mayExecuteHandler!==true)throw new WorkspaceError('SPLIT_STAGE_REPLAY_NO_EXECUTION',409);
 return true;
}
export function hasAcceptedOperationCredit(request:Request,ownerId:string){return admitted.has(request)&&acceptedOperationCredits.get(request)?.ownerId===ownerId;}
/** Tool arguments only identify a candidate. Actual authenticated ownership is
 * proved before a request may spend an operation's protected recovery hold. */
async function operationBudgetCredit(request:Request,principal:WorkspacePrincipal|undefined){
 if(!principal||!['human','agent'].includes(principal.role))return undefined;
 const url=new URL(request.url);let id:string|undefined;
 if(url.pathname==='/api/mcp'&&request.method==='POST'){
  const rpc=await request.clone().json().catch(()=>null),allowed=['get_market_order','get_market_delivery','claim_market_order','deliver_market_order','fail_market_order','uncertain_market_order'];
  if(rpc?.method==='tools/call'&&allowed.includes(rpc?.params?.name))id=rpc.params.arguments?.operationId;
 }else if(['GET','POST'].includes(request.method)){id=/^\/api\/market\/orders\/([a-f0-9-]{36})(?:\/x402)?$/.exec(url.pathname)?.[1];}
 if(typeof id!=='string'||!/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(id))return undefined;
 // A new-storage hold is spendable only after the same native ownership proof
 // as legacy recovery. The unresolved original never enters this repository.
 if(id!=='31c97193-be74-4b9d-b0a3-f3890b0a41e8'){
  const storage=await import('./market-order-storage.ts');
  if(storage.marketPerOrderStorageEnabled(id)&&storage.perOrderOperationId(id)){
   const envelope=await storage.configuredMarketOrderRepository().read(id);
   if(envelope){const order=envelope.order??envelope.recovery;
    if(!order||order.buyerOwnerId!==principal.ownerId&&order.sellerOwnerId!==principal.ownerId)return {operationLookup:true as const};
    const pending=envelope.order?!['delivered','delivery-failed'].includes(envelope.order.phase)&&(envelope.order.phase!=='awaiting-payment'||envelope.order.sellerReservation?.committed===true||Date.parse(envelope.order.sellerReservation?.expiresAt??'')>Date.now()):envelope.recovery?.paymentPhase==='uncertain'||envelope.recovery?.sellerReservationPending===true;
    if(pending)acceptedOperationCredits.set(request,{operationId:id,ownerId:principal.ownerId});
    return {operationLookup:true as const,operationId:id,principalHash:sha(order.buyerOwnerId),...(envelope.budgetProfile==='batch-v1'?{perOrderProfile:'batch-v1' as const,perOrderHoldRequired:pending}:{})};
   }
  }
 }
 const {configuredMarketStore}=await import('./marketplace-store.ts');
 const snapshot=await configuredMarketStore().transact(s=>({order:s.orders.find(o=>o.operationId===id),archived:s.archived?.find(o=>o.operationId===id)})),order=snapshot.order??snapshot.archived;
 if(!order||order.buyerOwnerId!==principal.ownerId&&order.sellerOwnerId!==principal.ownerId)return {operationLookup:true as const};
 const pending=snapshot.order?!['delivered','delivery-failed'].includes(snapshot.order.phase)&&(snapshot.order.phase!=='awaiting-payment'||snapshot.order.sellerReservation?.committed===true||Date.parse(snapshot.order.sellerReservation?.expiresAt??'')>Date.now()):snapshot.archived?.paymentPhase==='uncertain'||snapshot.archived?.sellerReservationPending===true;
 if(pending)acceptedOperationCredits.set(request,{operationId:id,ownerId:principal.ownerId});
 return {operationLookup:true as const,operationId:id,principalHash:sha(order.buyerOwnerId)};
}
export function isNestedMcpRequest(request:Request){return mcpNested.has(request);}
export function inheritDemoIngress(source:Request|undefined,target:Request){if(source&&admitted.has(source)){admitted.add(target);const credit=acceptedOperationCredits.get(source);if(credit&&nativeOrderId(target)===credit.operationId)acceptedOperationCredits.set(target,credit);}if(source&&new URL(source.url).pathname==='/api/mcp')mcpNested.add(target);return target;}
export async function demoIngress(request:Request){
  if(!demoEnabled()||admitted.has(request))return;
  const pending=admitting.get(request);if(pending)return pending;
  const operation=(async()=>{
    assertWorkspaceRequest(request,true);
    const freeBudget=freeDemoBudgetConfiguration();
    if(freeBudget){
      let principal:WorkspacePrincipal|undefined;
      const kind=await classifyFreeDemoRequest(request,async()=>{principal=await requireWorkspaceIngressPrincipal(request,/^\/api\/workspaces\/[^/]+\/access$/.test(new URL(request.url).pathname)?'bootstrap':undefined);assertTreasuryControlRequest(principal,request);return principal;});
      if(freeBudget.mode==='continuous'&&principal&&['human','agent'].includes(principal.role)&&projectedPublicIdentityRequest(request))await adoptProjectedIdentityControlBudget(request);
      const staged=freeBudget.mode==='continuous'?await splitStageCredit(request,principal):false;
      if(!staged){const credit=freeBudget.mode==='continuous'&&kind.profile==='recovery'?await operationBudgetCredit(request,principal):undefined;
       await configuredFreeDemoBudgetStore(freeBudget).reserve({...kind,...credit});}
    }
    await configuredWorkspaceStore().consumeIngress(trustedIp(request));admitted.add(request);
  })();
  admitting.set(request,operation);
  try{await operation;}finally{admitting.delete(request);}
}
async function walletPrincipal(request:Request){
  if(!demoEnabled())throw new WorkspaceError('PUBLIC_DEMO_DISABLED',503);
  await demoIngress(request);
  const authorization=request.headers.get('authorization');
  // Recovery access is allowed only for wallet replacement, never market tools.
  try{return await authenticateWorkspaceRequest(request);}
  catch(e){if(!(e instanceof WorkspaceError)||e.code!=='FORBIDDEN'||isNestedMcpRequest(request))throw e;const p=await requireWorkspacePrincipal(authorization,'bootstrap');await configuredWorkspaceStore().consumeRequest(p.ownerId,p.generation,(await import('./workspace-auth.ts')).workspaceBearerHash(authorization));return p;}
}
const json=(value:unknown)=>Response.json(value,{headers:workspaceHeaders});
export const demoHandlers={
  async identity(request:Request){try{if(projectedPublicIdentityRequest(request)){await prepareProjectedPublicIdentity(request);return json(takeProjectedPublicIdentity(request));}const p=await walletPrincipal(request);return json((await configuredWorkspaceStore().walletIdentity(p)).identity);}catch(e){return workspaceFailure(e);}},
  async challenge(request:Request){try{const p=await walletPrincipal(request),input=await parseWorkspaceBody(request,walletChallengeInput,1024);return json(await configuredWorkspaceStore().walletChallenge(p,input.wallet,workspaceRequestOrigin(request)));}catch(e){return workspaceFailure(e);}},
  async complete(request:Request){try{
    const p=await walletPrincipal(request),input=await parseWorkspaceBody(request,walletProofInput,1024),store=configuredWorkspaceStore(),origin=workspaceRequestOrigin(request);
    const challenge=await store.forPrincipal(p).readWalletChallenge(p,input.challengeId,origin);
    verifyWalletProof(challenge,input.signature);assertSingleSigner(await readTestnetWalletAccount(challenge.wallet),challenge.wallet);
    return json(await store.bindWallet(p,input.challengeId,origin,input.signature));
  }catch(e){return workspaceFailure(e);}},
  async history(request:Request){try{if(!demoEnabled())throw new WorkspaceError("PUBLIC_DEMO_DISABLED",503);await demoIngress(request);const p=await authenticateWorkspaceRequest(request);return json({queries:await configuredWorkspaceStore().forPrincipal(p).queries(p.ownerId)});}catch(e){return workspaceFailure(e);}},
};
