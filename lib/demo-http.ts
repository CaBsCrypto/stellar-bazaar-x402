import {demoEnabled,walletChallengeInput,walletProofInput,verifyWalletProof,assertSingleSigner,readTestnetWalletAccount} from './demo-wallet.ts';
import {authenticateWorkspaceRequest,assertWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders,workspaceRequestOrigin,trustedIp} from './workspace-http.ts';
import {requireWorkspacePrincipal} from './workspace-auth.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {sha} from './marketplace-identity.ts';
import {freeDemoBudgetConfiguration,configuredFreeDemoBudgetStore,classifyFreeDemoRequest} from './free-demo-budget.ts';
import {createContinuousExampleBudgetProof,createContinuousExampleControlProof,createContinuousExamplePublicProof,CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V2,CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V3,type ContinuousExampleBudgetProof} from './continuous-free-budget.ts';
import {activateExampleBudgetWireProof} from './example-budget-wire.ts';
const admitted=new WeakSet<Request>();
const admitting=new WeakMap<Request,Promise<void>>();
const mcpNested=new WeakSet<Request>();
/** Tool arguments only identify a candidate. Actual authenticated ownership is
 * proved before a request may spend an operation's protected recovery hold. */
async function operationBudgetCredit(request:Request,principal:WorkspacePrincipal|undefined):Promise<{operationLookup:true;operationId?:string;principalHash?:string;exampleBudgetProof?:ContinuousExampleBudgetProof;exampleBudgetPath?:'order-read'|'challenge'}|undefined>{
 if(!principal||!['human','agent'].includes(principal.role))return undefined;
 const url=new URL(request.url);let id:string|undefined,orderRead=false;
 if(url.pathname==='/api/mcp'&&request.method==='POST'){
  const rpc=await request.clone().json().catch(()=>null),allowed=['get_market_order','get_market_delivery','claim_market_order','deliver_market_order','fail_market_order','uncertain_market_order'];
  if(rpc?.method==='tools/call'&&allowed.includes(rpc?.params?.name)){id=rpc.params.arguments?.operationId;orderRead=rpc.params.name==='get_market_order';}
 }else if(['GET','HEAD','POST'].includes(request.method)){id=/^\/api\/market\/orders\/([a-f0-9-]{36})(?:\/x402)?$/.exec(url.pathname)?.[1];orderRead=['GET','HEAD'].includes(request.method)&&!url.pathname.endsWith('/x402');}
 if(typeof id!=='string'||!/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(id))return undefined;
 const {configuredMarketStore}=await import('./marketplace-store.ts');
 const order=await configuredMarketStore().transact(s=>s.orders.find(o=>o.operationId===id)??s.archived?.find(o=>o.operationId===id));
 if(!order||order.buyerOwnerId!==principal.ownerId&&order.sellerOwnerId!==principal.ownerId)return {operationLookup:true as const};
 const principalHash=sha(order.buyerOwnerId);
 const exampleBudgetProof='card' in order?createContinuousExampleBudgetProof(order,principalHash):undefined;
 const v2=exampleBudgetProof?.version===CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V2||exampleBudgetProof?.version===CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V3;
 const challenge=v2&&'card' in order&&order.phase==='awaiting-payment'&&!order.paymentVerifiedAt&&!order.transactionHash&&!order.settlementAttemptId&&request.method==='POST'&&url.pathname.endsWith('/x402')&&!request.headers.has('payment-signature');
 return {operationLookup:true as const,operationId:id,principalHash,...(exampleBudgetProof?{exampleBudgetProof}:{}),...(v2&&orderRead?{exampleBudgetPath:'order-read' as const}:challenge?{exampleBudgetPath:'challenge' as const}:{})};
}
export function isNestedMcpRequest(request:Request){return mcpNested.has(request);}
export function inheritDemoIngress(source:Request|undefined,target:Request){if(source&&admitted.has(source))admitted.add(target);if(source&&new URL(source.url).pathname==='/api/mcp')mcpNested.add(target);return target;}
export async function demoIngress(request:Request){
  if(!demoEnabled()||admitted.has(request))return;
  const pending=admitting.get(request);if(pending)return pending;
  const operation=(async()=>{
    assertWorkspaceRequest(request,true);
    const freeBudget=freeDemoBudgetConfiguration();
    if(freeBudget){
      let principal:WorkspacePrincipal|undefined;
      const kind=await classifyFreeDemoRequest(request,async()=>{principal=await requireWorkspacePrincipal(request.headers.get('authorization'),/^\/api\/workspaces\/[^/]+\/access$/.test(new URL(request.url).pathname)?'bootstrap':undefined);return principal;});
      const credit=freeBudget.mode==='continuous'&&kind.profile==='recovery'?await operationBudgetCredit(request,principal):undefined;
      const exampleBudgetProof=(credit&&'exampleBudgetProof' in credit?credit.exampleBudgetProof:undefined)??(principal&&!credit?.operationLookup?createContinuousExampleControlProof(principal.ownerId,kind):undefined)??(!credit?.operationLookup?createContinuousExamplePublicProof(kind):undefined);
      activateExampleBudgetWireProof(exampleBudgetProof,{...kind,...credit});
      await configuredFreeDemoBudgetStore(freeBudget).reserve({...kind,...credit,...(exampleBudgetProof?{exampleBudgetProof}:{})});
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
  async identity(request:Request){try{const p=await walletPrincipal(request);return json((await configuredWorkspaceStore().walletIdentity(p)).identity);}catch(e){return workspaceFailure(e);}},
  async challenge(request:Request){try{const p=await walletPrincipal(request),input=await parseWorkspaceBody(request,walletChallengeInput,1024);return json(await configuredWorkspaceStore().walletChallenge(p,input.wallet,workspaceRequestOrigin(request)));}catch(e){return workspaceFailure(e);}},
  async complete(request:Request){try{
    const p=await walletPrincipal(request),input=await parseWorkspaceBody(request,walletProofInput,1024),store=configuredWorkspaceStore(),origin=workspaceRequestOrigin(request);
    const challenge=await store.forPrincipal(p).readWalletChallenge(p,input.challengeId,origin);
    verifyWalletProof(challenge,input.signature);assertSingleSigner(await readTestnetWalletAccount(challenge.wallet),challenge.wallet);
    return json(await store.bindWallet(p,input.challengeId,origin,input.signature));
  }catch(e){return workspaceFailure(e);}},
  async history(request:Request){try{if(!demoEnabled())throw new WorkspaceError("PUBLIC_DEMO_DISABLED",503);await demoIngress(request);const p=await authenticateWorkspaceRequest(request);return json({queries:await configuredWorkspaceStore().forPrincipal(p).queries(p.ownerId)});}catch(e){return workspaceFailure(e);}},
};
