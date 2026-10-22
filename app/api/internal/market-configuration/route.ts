import {marketRuntimeConfigurationRequestFailure,MARKET_RUNTIME_CONFIGURATION_HEADERS} from '../../../../lib/market-runtime-configuration-request.ts';
import {marketRuntimeConfigurationAttestation} from '../../../../lib/market-runtime-configuration.ts';
import {pilotReviewProfile} from '../../../../lib/pilot-review-transport.ts';
import {workspaceMaintenanceProfile} from '../../../../lib/pilot-maintenance-profile.ts';
import {continuousFreeBudgetConfiguration} from '../../../../lib/continuous-free-budget.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=5;

/** Deliberately outside store-backed ingress: authenticates the existing
 * operator and only invokes pure native configuration validators. */
export function GET(request:Request):Response{
 const failure=marketRuntimeConfigurationRequestFailure(request,process.env);
 if(failure)return Response.json({error:{code:failure.code}},{status:failure.status,headers:MARKET_RUNTIME_CONFIGURATION_HEADERS});
 try{
  const review=pilotReviewProfile(),maintenance=workspaceMaintenanceProfile();
  const deploymentId=process.env.VERCEL_DEPLOYMENT_ID;
  if((deploymentId!==undefined||review||maintenance)&&!/^dpl_[A-Za-z0-9]+$/.test(deploymentId??''))throw new Error('DEPLOYMENT_ATTESTATION_UNAVAILABLE');
  const headers={...MARKET_RUNTIME_CONFIGURATION_HEADERS,
   'X-Bazaar-Pilot-Review-Transport':review?'bounded-v1':'disabled',
   'X-Bazaar-Pilot-Maintenance-Transport':maintenance?'workspace-v1':'disabled',
   'X-Bazaar-Transfer-Budget-Bytes':String(continuousFreeBudgetConfiguration()?.transferBytes??0),
   ...(deploymentId?{'X-Bazaar-Deployment-Id':deploymentId}:{}),
  };
  const result=marketRuntimeConfigurationAttestation(process.env,Date.now());
  return Response.json({observedAt:new Date().toISOString(),...result},{status:200,headers});
 }catch{
  return Response.json({error:{code:'RUNTIME_CONFIGURATION_UNAVAILABLE'}},{status:503,headers:MARKET_RUNTIME_CONFIGURATION_HEADERS});
 }
}
