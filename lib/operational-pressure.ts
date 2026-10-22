import {createWorkspaceSchema} from './workspace-types.ts';
import {compactTransportV2} from './free-plan-transport-profile.ts';
export const operationalProfiles = ['public', 'authenticated', 'recovery'] as const;
export type OperationalProfile = typeof operationalProfiles[number];
export const OPERATIONAL_ALERT_PERCENT = 70;
export const OPERATIONAL_PAUSE_PERCENT = 75;
export const OPERATIONAL_PROFILE_PERCENT = { public: 20, authenticated: 50, recovery: 30 } as const;

/** Pure pressure decision; reads and finalization retain their separate reserve. */
export function operationalPressure(used: number, assigned: number, newOperation: boolean) {
  if (!Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(assigned) || assigned < 0) throw Error('OPERATIONAL_BUDGET_INVALID');
  const percent = assigned === 0 ? 100 : Math.ceil(used * 100 / assigned);
  return { percent, alert: percent >= OPERATIONAL_ALERT_PERCENT, paused: newOperation && percent >= OPERATIONAL_PAUSE_PERCENT, exhausted: used >= assigned };
}

export type OperationalWorkload = 'metadata'|'observed-metadata'|'catalog'|'identity'|'orders'|'private-history'|'seller-control'|'capacity'|'financial'|'order-create'|'wallet-binding';
export type OperationalRequestClass = { profile: OperationalProfile; newOperation: boolean; workload?:OperationalWorkload; bootstrapCreation?:true };
const continuousMode=()=>process.env.BAZAAR_FREE_DEMO_MODE==='continuous';
const nativeWorkspaceHistory=()=>process.env.BAZAAR_WORKSPACE_BACKEND==='redis'&&process.env.BAZAAR_ENABLE_OPEN_WORKSPACES==='true';
/** Conservative until a handler proves that an existing intent is being recovered. */
export function operationalRequestClass(request?: Request): OperationalRequestClass {
  if (!request) return { profile: 'recovery', newOperation: false };
  const path = new URL(request.url).pathname, method = request.method.toUpperCase();
  // Exact native POST routes only. The route's measuredHandler establishes a
  // hard Redis/response scope before credentials, ingress or owner quota work.
  // Without that scope continuousFreeReservation keeps its legacy fallback.
  if(method==='POST'&&['/api/account/wallet/challenge','/api/account/wallet/complete'].includes(path)&&compactTransportV2())return path.endsWith('/challenge')?{profile:'authenticated',newOperation:true,workload:'wallet-binding'}:{profile:'recovery',newOperation:false,workload:'wallet-binding'};
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if(continuousMode()&&process.env.BAZAAR_ENABLE_MARKETPLACE==='true'&&['GET','HEAD'].includes(method)&&path==='/api/market/catalog')return {profile:'public',newOperation:false,workload:'catalog'};
    if(path==='/api/mcp')return {profile:'public',newOperation:false,workload:'metadata'};
    if(path==='/api/account/identity')return {profile:'recovery',newOperation:false,workload:'identity'};
    if(path==='/api/market/orders')return {profile:'recovery',newOperation:false,workload:'orders'};
    if(continuousMode()&&nativeWorkspaceHistory()&&['GET','HEAD'].includes(method)&&['/api/operations','/api/activity','/api/account/queries'].includes(path))return {profile:'recovery',newOperation:false,workload:'private-history'};
    if(continuousMode()&&/^\/api\/market\/orders\/[a-f0-9-]{36}$/.test(path))return {profile:'recovery',newOperation:false,workload:'orders'};
    return { profile: ['/api/discovery/resources', '/api/discovery/search', '/api/market/catalog', '/api/mcp'].includes(path) ? 'public' : 'recovery', newOperation: false };
  }
  if(continuousMode()&&method==='POST'&&/^\/api\/market\/orders\/[a-f0-9-]{36}\/x402$/.test(path))return {profile:'recovery',newOperation:false,workload:'financial'};
  if(continuousMode()&&method==='POST'&&path==='/api/market/orders')return {profile:'authenticated',newOperation:true,workload:'order-create'};
  if (path === '/api/market/control' || path === '/api/market/operations-budget' || path === '/api/market/review' ||
      path === '/api/market/guardian' || path === '/api/account/wallet/complete' ||
      /^\/api\/market\/orders\/[^/]+\/x402$/.test(path) ||
      /^\/api\/market\/orders\/[^/]+\/deliveries(?:\/confirm)?$/.test(path) ||
      /^\/api\/workspaces\/[^/]+\/access$/.test(path) || ['/api/operations', '/api/activity', '/api/activity/connection'].includes(path) ||
      /^\/api\/agent-tasks\/[^/]+\/response$/.test(path)) return { profile: 'recovery', newOperation: false };
  // The payment handler must distinguish a fresh submission from a persisted attempt.
  return { profile: 'authenticated', newOperation: true };
}

const mcpNewWork = new Set(['submit_market_service', 'create_market_order', 'create_bazaar_workspace', 'submit_provider_request']);
const mcpMetadata=new Set(['get_bazaar_integration','get_bazaar_capabilities','list_workflow_bundles','get_workflow_bundle','validate_service_card','get_bazaar_skills']);
export const publicOperationalMcpTools = new Set(['get_bazaar_integration','get_bazaar_capabilities', 'list_market_services', 'list_services', 'search_services', 'get_service', 'list_workflow_bundles', 'get_workflow_bundle', 'validate_service_card', 'get_bazaar_skills']);
const mcpRecovery = new Set(['get_bazaar_identity', 'get_bazaar_query_history', 'complete_wallet_binding', 'list_market_services', 'get_market_submission', 'get_market_order', 'list_market_orders', 'get_operation_history', 'get_provider_request_status', 'list_bazaar_agent_tasks', 'claim_market_order', 'prepare_market_delivery', 'confirm_market_delivery', 'get_market_delivery', 'deliver_market_order', 'fail_market_order', 'uncertain_market_order', 'claim_bazaar_agent_task', 'respond_bazaar_agent_task', 'record_bazaar_operation', 'record_bazaar_activity']);
function validBootstrapCreation(request:Request,input:unknown) {
  return request.headers.get('content-type')?.split(';')[0].trim()==='application/json' &&
    /^Bearer [a-zA-Z0-9_-]{32,128}$/.test(request.headers.get('authorization')??'') &&
    Buffer.byteLength(JSON.stringify(input)??'')<=1024 && createWorkspaceSchema.safeParse(input).success;
}
/** Inspect only bounded control names. Raw arguments never reach metrics or logs. */
export async function classifyOperationalRequest(request?: Request): Promise<OperationalRequestClass> {
  const initial = operationalRequestClass(request);
  if (!request || request.method !== 'POST') return initial;
  const path = new URL(request.url).pathname;
  if (path !== '/api/mcp' && path !== '/api/workspaces' && path!=='/api/market/capacity' && !/^\/api\/market\/(orders\/[^/]+|services\/[^/]+|agent-permissions)$/.test(path)) return initial;
  const clone = request.clone(), reader = clone.body?.getReader();
  if (!reader) return initial;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > (path==='/api/workspaces'?1024:65536)) { void reader.cancel(); return initial; } chunks.push(value); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(path==='/api/workspaces')return validBootstrapCreation(request,body)?{...initial,bootstrapCreation:true}:initial;
    if (path === '/api/mcp') {
      if (Array.isArray(body)) return initial;
      if (body?.method === 'tools/call') {
        const name = body?.params?.name;
        if (typeof name !== 'string') return initial;
        if(name==='create_bazaar_workspace')return validBootstrapCreation(request,body.params.arguments)?{...initial,bootstrapCreation:true}:initial;
        if(continuousMode()&&name==='create_market_order')return {profile:'authenticated',newOperation:true,workload:'order-create'};
        if (mcpNewWork.has(name)) return initial;
        if(continuousMode()&&process.env.BAZAAR_ENABLE_MARKETPLACE==='true'&&['list_market_services','list_services','search_services','get_service','get_bazaar_skills'].includes(name))return {profile:'public',newOperation:false,workload:'catalog'};
        if(continuousMode()&&name==='get_service'&&request.headers.has('authorization'))return {profile:'public',newOperation:false,workload:'observed-metadata'};
        if(name==='get_bazaar_identity')return {profile:'recovery',newOperation:false,workload:'identity'};
        if(name==='list_market_orders')return {profile:'recovery',newOperation:false,workload:'orders'};
        if(continuousMode()&&nativeWorkspaceHistory()&&['get_operation_history','get_bazaar_query_history'].includes(name))return {profile:'recovery',newOperation:false,workload:'private-history'};
        if(continuousMode()&&name==='get_market_order')return {profile:'recovery',newOperation:false,workload:'orders'};
        if(continuousMode()&&['claim_market_order','deliver_market_order','fail_market_order','uncertain_market_order'].includes(name))return {profile:'recovery',newOperation:false,workload:'seller-control'};
        if(name==='report_market_capacity')return {profile:'authenticated',newOperation:body.params?.arguments?.ready!==false,workload:'capacity'};
        if(mcpMetadata.has(name))return {profile:'public',newOperation:false,workload:request.headers.has('authorization')&&name!=='validate_service_card'?'observed-metadata':'metadata'};
        if (publicOperationalMcpTools.has(name)) return { profile: 'public', newOperation: false };
        return mcpRecovery.has(name) ? { profile: 'recovery', newOperation: false } : initial;
      }
      return { profile: 'public', newOperation: false, workload:'metadata' };
    }
    if(path==='/api/market/capacity')return {profile:'authenticated',newOperation:body.ready!==false,workload:'capacity'};
    if (path === '/api/market/agent-permissions' || /^\/api\/market\/services\//.test(path) ||
        ['reconcile', 'claim', 'deliver', 'fail', 'execution-uncertain'].includes(body?.action)) return { profile: 'recovery', newOperation: false,...(continuousMode()&&/^\/api\/market\/orders\/[a-f0-9-]{36}$/.test(path)?body?.action==='reconcile'?{workload:'financial' as const}:['claim','deliver','fail','execution-uncertain'].includes(body?.action)?{workload:'seller-control' as const}:{}:{}) };
    return initial;
  } catch { return initial; }
}
