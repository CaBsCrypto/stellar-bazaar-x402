import {demoIngress,isNestedMcpRequest} from './demo-http.ts';
import {demoEnabled} from './demo-wallet.ts';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {authenticateWorkspaceRequest,assertWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders,workspaceRequestOrigin} from './workspace-http.ts';
import {assertMarketEnabled,newServiceSchema,newOrderSchema,orderActionSchema,submitMarketService,marketCatalogPage,marketServiceSnapshot,pageMarketServices,readMarketSubmission,withdrawService,createMarketOrder,listMarketOrdersPage,readMarketOrder,sellerOrderAction,marketOperator} from './marketplace.ts';
import {verifyMarketPayment} from './marketplace-payment.ts';
import {configuredMarketStore} from './marketplace-store.ts';
import {marketPrefix} from './marketplace-store.ts';
import {WorkspaceError,marketPermissionChangeSchema} from './workspace-types.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {marketSubmissionGuard} from './market-permissions.ts';
import {assertMarketDto,marketPageFromRequest} from './market-pagination.ts';
import {verifySubmissionDns,verifySubmissionHttp,activateSubmission,recoverSubmissionActivation,type OperatorRegistry} from './provider-review-operator.ts';
import {getSubmissionForOperator,recordManualReview,stageApprovedSubmission} from './provider-self-listing.ts';
import {createDynamicServiceCard,getDynamicServiceCard} from './dynamic-registry.ts';
import {sha} from './marketplace.ts';
import {reconcileMarketX402Payment} from './marketplace-x402.ts';

const response=(value:unknown,status=200)=>Response.json(assertMarketDto(value),{status,headers:workspaceHeaders});
export const marketHandlers={
 async catalog(request:Request){try{
 await demoIngress(request);assertMarketEnabled();assertWorkspaceRequest(request,true);
 const observed=demoEnabled()&&request.headers.has('authorization')&&!isNestedMcpRequest(request);
 const requestId=observed?z.string().uuid().parse(request.headers.get('x-bazaar-query-id')??randomUUID()):undefined;
 const principal=observed?await authenticateWorkspaceRequest(request,undefined,true):undefined;
 const body=await marketCatalogPage(marketPageFromRequest(request),workspaceRequestOrigin(request));
 if(principal&&requestId){const store=configuredWorkspaceStore(),identity=(await store.walletIdentity(principal)).identity;
 await store.forPrincipal(principal).recordQuery(principal.ownerId,{requestId,tool:'http_market_catalog',agentId:principal.agentId,...(identity.wallet?{wallet:identity.wallet.wallet}:{}),recordedAt:new Date().toISOString(),outcome:'ok',resultCount:body.services.length,inputHash:sha(new URL(request.url).search),resultHash:sha(JSON.stringify(body)),evidence:'bazaar-observed'});}
 return Response.json(assertMarketDto(body),{headers:{...workspaceHeaders,'Cache-Control':observed?'private, no-store':'public, no-store'}});
 }catch(e){return workspaceFailure(e);}},
 async services(request:Request){try{assertMarketEnabled();const options=marketPageFromRequest(request,['mineCursor']),p=await authenticateWorkspaceRequest(request,undefined,true),origin=workspaceRequestOrigin(request),snapshot=await marketServiceSnapshot();const publicPage=pageMarketServices(snapshot,options,origin,undefined,60*1024),mineCursor=new URL(request.url).searchParams.get('mineCursor'),minePage=pageMarketServices(snapshot,{limit:options.limit,...(mineCursor!==null?{cursor:mineCursor}:{})},origin,p.ownerId,60*1024);return response({services:publicPage.services,mine:minePage.services,paused:snapshot.paused,nextCursor:publicPage.nextCursor,mineNextCursor:minePage.nextCursor,partialResults:publicPage.partialResults||minePage.partialResults});}catch(e){return workspaceFailure(e);}},
 async submission(request:Request,id:string){try{assertMarketEnabled();z.string().uuid().parse(id);const p=await authenticateWorkspaceRequest(request);return response({submission:await readMarketSubmission(p,id,workspaceRequestOrigin(request))});}catch(e){return workspaceFailure(e);}},
 async permissions(request:Request){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request,'human'),store=configuredWorkspaceStore();if(request.method==='GET')return response({permission:(await store.readMarketPermissionSnapshot(p)).permission});const input=await parseWorkspaceBody(request,marketPermissionChangeSchema,1024);return response(await store.changeMarketPermissions(p,input));}catch(e){return workspaceFailure(e);}},
 async submit(request:Request){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request);await marketSubmissionGuard(p);const input=await parseWorkspaceBody(request,newServiceSchema);return response({submission:await submitMarketService(p,input)},201);}catch(e){return workspaceFailure(e);}},
 async withdraw(request:Request,id:string){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request,'human');await parseWorkspaceBody(request,z.object({action:z.literal('withdraw')}).strict(),1024);return response(await withdrawService(p,id));}catch(e){return workspaceFailure(e);}},
 async orders(request:Request){try{assertMarketEnabled();const options=marketPageFromRequest(request),p=await authenticateWorkspaceRequest(request,undefined,true);return response(await listMarketOrdersPage(p,options));}catch(e){return workspaceFailure(e);}},
 async create(request:Request){try{assertMarketEnabled();if(process.env.BAZAAR_ENABLE_MARKET_PURCHASES!=='true')throw new WorkspaceError('PURCHASES_PAUSED');const p=await authenticateWorkspaceRequest(request);return response({order:await createMarketOrder(p,await parseWorkspaceBody(request,newOrderSchema))},201);}catch(e){return workspaceFailure(e);}},
 async read(request:Request,id:string){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request);return response({order:await readMarketOrder(p,id)});}catch(e){return workspaceFailure(e);}},
 async action(request:Request,id:string){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request),body=await parseWorkspaceBody(request,orderActionSchema,18000);
 if(body.action==='prepare'||body.action==='pay'){throw new WorkspaceError('PAYMENT_PROTOCOL_MISMATCH',409);}
 if(body.action==='reconcile'){const order=await readMarketOrder(p,id);return response({order:order.paymentProtocol?await reconcileMarketX402Payment(p,id):await verifyMarketPayment(p,id)});}
 return response({order:await sellerOrderAction(p,id,body)});
 }catch(e){return workspaceFailure(e);}},
 async control(request:Request){try{assertMarketEnabled();assertWorkspaceRequest(request);await marketOperator(request.headers.get('authorization'));const body=await parseWorkspaceBody(request,z.object({action:z.enum(['pause','resume'])}).strict(),1024);return response(await configuredMarketStore().transact(s=>{s.paused=body.action==='pause';return {paused:s.paused};}));}catch(e){return workspaceFailure(e);}},
 async review(request:Request){try{
 assertMarketEnabled();assertWorkspaceRequest(request);await marketOperator(request.headers.get('authorization'));
 await configuredMarketStore().transact(s=>{const minute=Math.floor(Date.now()/60000);if(!s.operatorQuota||s.operatorQuota.minute!==minute)s.operatorQuota={minute,count:0};if(s.operatorQuota.count>=20)throw new WorkspaceError('OPERATOR_RATE_LIMIT',429);s.operatorQuota.count++;});
 const body=await parseWorkspaceBody(request,z.object({submissionId:z.string().uuid(),action:z.enum(['verify-dns','verify-http','approve','reject','activate','recover']),reason:z.string().min(1).max(500).optional()}).strict(),2048);
 const service=await configuredMarketStore().transact(s=>s.services.find(v=>v.submissionId===body.submissionId));if(!service||service.withdrawn)throw new WorkspaceError('NOT_FOUND',404);
 let value;
 if(body.action==='verify-dns')value=await verifySubmissionDns(body.submissionId);
 else if(body.action==='verify-http')value=await verifySubmissionHttp(body.submissionId);
 else if(body.action==='approve'||body.action==='reject'){
 if(!body.reason)throw new WorkspaceError('REVIEW_REASON_REQUIRED',400);
 const r=await recordManualReview(body.submissionId,{decision:body.action==='approve'?'approve':'reject',reviewerId:'market-pilot-operator',reasons:[body.reason]});if(!r.ok)throw new WorkspaceError(r.error.code,409);value=r.value;
 }else {
 if(process.env.BAZAAR_ENABLE_PROVIDER_ACTIVATION!=='true')throw new WorkspaceError('ACTIVATION_DISABLED');
 const registry:OperatorRegistry={configured:()=>process.env.BAZAAR_DYNAMIC_PREFIX===marketPrefix()+':catalog',create:async card=>{const result=await createDynamicServiceCard(card,sha(service.ownerId));return 'entry' in result?{ok:true,entry:result.entry}:{ok:false,error:{code:'SERVICE_CONFLICT'}};},read:getDynamicServiceCard};
 const r=await getSubmissionForOperator(body.submissionId);if(!r.ok)throw new WorkspaceError(r.error.code);
 if(body.action==='activate'&&r.value.status==='approved-for-staging'){const staged=await stageApprovedSubmission(body.submissionId);if(!staged.ok)throw new WorkspaceError(staged.error.code,409);}
 value=body.action==='activate'?await activateSubmission(body.submissionId,registry):await recoverSubmissionActivation(body.submissionId,registry);
 }
 return response({submission:value});
 }catch(e){return workspaceFailure(e instanceof WorkspaceError?e:new WorkspaceError('REVIEW_ACTION_UNCONFIRMED',409));}},
};
