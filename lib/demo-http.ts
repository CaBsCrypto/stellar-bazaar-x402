import {demoEnabled,walletChallengeInput,walletProofInput,verifyWalletProof,assertSingleSigner,readTestnetWalletAccount} from './demo-wallet.ts';
import {authenticateWorkspaceRequest,assertWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders,workspaceRequestOrigin,trustedIp} from './workspace-http.ts';
import {requireWorkspacePrincipal} from './workspace-auth.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {WorkspaceError} from './workspace-types.ts';
const admitted=new WeakSet<Request>();
const mcpNested=new WeakSet<Request>();
export function isNestedMcpRequest(request:Request){return mcpNested.has(request);}
export function inheritDemoIngress(source:Request|undefined,target:Request){if(source&&admitted.has(source))admitted.add(target);if(source&&new URL(source.url).pathname==='/api/mcp')mcpNested.add(target);return target;}
export async function demoIngress(request:Request){
  if(!demoEnabled()||admitted.has(request))return;
  assertWorkspaceRequest(request,true);
  await configuredWorkspaceStore().consumeIngress(trustedIp(request));admitted.add(request);
}
async function walletPrincipal(request:Request){
  if(!demoEnabled())throw new WorkspaceError('PUBLIC_DEMO_DISABLED',503);
  await demoIngress(request);
  const authorization=request.headers.get('authorization');
  // Recovery access is allowed only for wallet replacement, never market tools.
  try{return await authenticateWorkspaceRequest(request);}
  catch(e){if(!(e instanceof WorkspaceError)||e.code!=='FORBIDDEN')throw e;const p=await requireWorkspacePrincipal(authorization,'bootstrap');await configuredWorkspaceStore().consumeRequest(p.ownerId,p.generation,(await import('./workspace-auth.ts')).workspaceBearerHash(authorization));return p;}
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
