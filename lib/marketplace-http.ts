import {z} from 'zod';
import {authenticateWorkspaceRequest,assertWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders} from './workspace-http.ts';
import {assertMarketEnabled,newServiceSchema,newOrderSchema,orderActionSchema,submitMarketService,marketServices,withdrawService,createMarketOrder,listMarketOrders,readMarketOrder,sellerOrderAction,marketOperator} from './marketplace.ts';
import {prepareMarketPayment,payMarketOrder,verifyMarketPayment} from './marketplace-payment.ts';
import {configuredMarketStore} from './marketplace-store.ts';
import {marketPrefix} from './marketplace-store.ts';
import {WorkspaceError} from './workspace-types.ts';
import {verifySubmissionDns,verifySubmissionHttp,activateSubmission,recoverSubmissionActivation,type OperatorRegistry} from './provider-review-operator.ts';
import {getSubmissionForOperator,recordManualReview,stageApprovedSubmission} from './provider-self-listing.ts';
import {createDynamicServiceCard,getDynamicServiceCard} from './dynamic-registry.ts';
import {sha} from './marketplace.ts';

const response=(value:unknown,status=200)=>Response.json(value,{status,headers:workspaceHeaders});
export const marketHandlers={
 async services(request:Request){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request);return response({services:await marketServices(),mine:await marketServices(p.ownerId),paused:await configuredMarketStore().transact(s=>s.paused??false)});}catch(e){return workspaceFailure(e);}},
 async submit(request:Request){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request,'human');const input=await parseWorkspaceBody(request,newServiceSchema);return response({submission:await submitMarketService(p,input)},201);}catch(e){return workspaceFailure(e);}},
 async withdraw(request:Request,id:string){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request,'human');await parseWorkspaceBody(request,z.object({action:z.literal('withdraw')}).strict(),1024);return response(await withdrawService(p,id));}catch(e){return workspaceFailure(e);}},
 async orders(request:Request){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request);return response({orders:await listMarketOrders(p)});}catch(e){return workspaceFailure(e);}},
 async create(request:Request){try{assertMarketEnabled();if(process.env.BAZAAR_ENABLE_MARKET_PURCHASES!=='true')throw new WorkspaceError('PURCHASES_PAUSED');const p=await authenticateWorkspaceRequest(request,'human');return response({order:await createMarketOrder(p,await parseWorkspaceBody(request,newOrderSchema))},201);}catch(e){return workspaceFailure(e);}},
 async read(request:Request,id:string){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request);return response({order:await readMarketOrder(p,id)});}catch(e){return workspaceFailure(e);}},
 async action(request:Request,id:string){try{assertMarketEnabled();const p=await authenticateWorkspaceRequest(request),body=await parseWorkspaceBody(request,orderActionSchema,18000);
 if(body.action==='prepare'||body.action==='pay'){if(process.env.BAZAAR_ENABLE_MARKET_PURCHASES!=='true')throw new WorkspaceError('PURCHASES_PAUSED');if(body.action==='prepare')return response({payment:await prepareMarketPayment(p,id)});return response({order:await payMarketOrder(p,id,body.signedXdr)});}
 if(body.action==='reconcile')return response({order:await verifyMarketPayment(p,id)});
 return response({order:await sellerOrderAction(p,id,body)});
 }catch(e){return workspaceFailure(e);}},
 async control(request:Request){try{assertMarketEnabled();assertWorkspaceRequest(request);marketOperator(request.headers.get('authorization'));const body=await parseWorkspaceBody(request,z.object({action:z.enum(['pause','resume'])}).strict(),1024);return response(await configuredMarketStore().transact(s=>{s.paused=body.action==='pause';return {paused:s.paused};}));}catch(e){return workspaceFailure(e);}},
 async review(request:Request){try{
 assertMarketEnabled();assertWorkspaceRequest(request);marketOperator(request.headers.get('authorization'));
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
