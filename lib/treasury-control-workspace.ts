import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createWorkspaceSchema,workspaceHashSchema,WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {continuousFreeBudgetConfiguration} from './continuous-free-budget.ts';
import {marketDiagnosticOperatorMatches} from './market-operator-diagnostic-origin.ts';
import {compactTransportV2} from './free-plan-transport-profile.ts';

export const TREASURY_CONTROL_PURPOSE='treasury-controls' as const;
// Conservative native transport recipe; this is not physical provider usage.
// Registration and two identity reads, plus an explicit safety allowance.
// Wallet proof, binding and history need a separate future preflight; no future
// resources are promised. Every real request
// is charged separately by native ingress; this admission forecast writes no hold.
export const TREASURY_CONTROL_PACKAGE=Object.freeze({version:1,mode:'conservative-unmeasured',transferBytes:16*1048576,recoveryCommands:320,requests:3,safetyBytes:2*1048576});
const intentSchema=createWorkspaceSchema.extend({version:z.literal(1),bootstrapHash:workspaceHashSchema}).strict();
type Environment=Readonly<Record<string,string|undefined>>;
export function assertTreasuryControlRegistration(input:z.infer<typeof createWorkspaceSchema>,bootstrapHash:string,request:Request|undefined,environment:Environment=process.env){
 if(environment.BAZAAR_ENABLE_TREASURY_WORKSPACE_REGISTRATION!=='true')throw new WorkspaceError('NOT_FOUND',404);
 if(!request||!marketDiagnosticOperatorMatches(request,environment))throw new WorkspaceError('FORBIDDEN',403);
 const raw=environment.BAZAAR_TREASURY_WORKSPACE_REGISTRATION_JSON;
 let intent:z.infer<typeof intentSchema>;try{if(!raw||Buffer.byteLength(raw)>1024)throw Error();intent=intentSchema.parse(JSON.parse(raw));}catch{throw new WorkspaceError('TREASURY_REGISTRATION_CONFIGURATION_INCOMPLETE',503);}
 if(intent.creationId!==input.creationId||intent.bootstrapHash!==bootstrapHash||intent.humanAccessHash!==input.humanAccessHash||intent.agentAccessHash!==input.agentAccessHash)throw new WorkspaceError('TREASURY_REGISTRATION_INTENT_MISMATCH',403);
 if(environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||environment.BAZAAR_WORKSPACE_BACKEND!=='redis'||!compactTransportV2(environment))throw new WorkspaceError('TREASURY_REGISTRATION_CONFIGURATION_INCOMPLETE',503);
}
export function treasuryControlRegistrationPool(creationId:string,ownerId:string,environment:Environment=process.env){
 const configuration=continuousFreeBudgetConfiguration(environment);if(!configuration)throw new WorkspaceError('TREASURY_REGISTRATION_CONFIGURATION_INCOMPLETE',503);
 return {configuration,request:{action:'reserve',operationId:creationId,principalHash:createHash('sha256').update(ownerId).digest('hex'),recoveryCommands:TREASURY_CONTROL_PACKAGE.recoveryCommands,backgroundCommands:0,transferBytes:0,globalAllowanceBytes:TREASURY_CONTROL_PACKAGE.transferBytes}};
}
/** Only a principal returned by native credential resolution may enter here.
 * This is authorization, never an untrusted purpose/header budget discount. */
export function assertTreasuryControlRequest(principal:WorkspacePrincipal,request:Request){
 if(principal.purpose!==TREASURY_CONTROL_PURPOSE)return;
 const u=new URL(request.url),path=u.pathname,method=request.method;
 if(principal.role==='bootstrap'){
  if(method==='POST'&&path===`/api/workspaces/${principal.workspaceId}/access`&&u.search==='')return;
  throw new WorkspaceError('TREASURY_CONTROL_SCOPE',403);
 }
 if(principal.role!=='human')throw new WorkspaceError('TREASURY_CONTROL_SCOPE',403);
 if(u.search===''&&((method==='GET'&&path==='/api/account/identity')||(method==='POST'&&['/api/account/wallet/challenge','/api/account/wallet/complete'].includes(path))||(['GET','POST'].includes(method)&&path==='/api/market/split-v1/treasury-binding')))return;
 if(method==='GET'&&path==='/api/market/split-v1/history'&&u.searchParams.getAll('limit').length===1&&u.searchParams.get('limit')==='1'&&[...u.searchParams.keys()].every(k=>k==='limit'||k==='cursor')&&u.searchParams.getAll('cursor').length<=1){
  const cursor=u.searchParams.get('cursor');if(cursor===null||/^[A-Za-z0-9_-]{1,2048}$/.test(cursor))return;
 }
 throw new WorkspaceError('TREASURY_CONTROL_SCOPE',403);
}
export function consumeTreasuryControl(windows:{key:string;count:number;until:number}[],meta:{ownerId:string;createdAt:string},now=Date.now()){
 const created=Date.parse(meta.createdAt),period=31*86400000;if(!Number.isSafeInteger(created)||created>now)throw new WorkspaceError('TREASURY_CONTROL_CONFIGURATION_INVALID',503);
 const start=created+Math.floor((now-created)/period)*period,until=start+period,key=`treasury-owner:${meta.ownerId}:${start}`;let row=windows.find(w=>w.key===key);
 if(row&&row.count>=48)throw new WorkspaceError('OWNER_CONTROL_LIMIT',429,Math.max(1,Math.ceil((until-now)/1000)));
 if(!row){row={key,count:0,until};windows.push(row);}row.count++;
}
