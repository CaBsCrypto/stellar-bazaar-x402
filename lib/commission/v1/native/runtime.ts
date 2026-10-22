import {revalidateSplitReadIdentity} from './readonly-auth.ts';
import {authenticateWorkspaceRequest} from '../../../workspace-http.ts';
import {createSplitHttpHandlers,type NativeSplitHandlers} from './http.mjs';
import {configuredNativeSplitComponents} from './composition.ts';
// Read/history and owning seller reports do not require a financial provider.
// No IO at import; no implicit provider or financial authority can be enabled.
const disabled=createSplitHttpHandlers({authenticate:authenticateWorkspaceRequest});
function handlers(){if(process.env.BAZAAR_SPLIT_HTTP_ENABLED!=='true')return disabled;try{return createSplitHttpHandlers({authenticate:authenticateWorkspaceRequest,...configuredNativeSplitComponents(),revalidateReadIdentity:revalidateSplitReadIdentity,enabled:true});}catch{return disabled;}}
const names=['context','terms','create','order','challenge','settle','history','deliver','delivery','reconcile','sellerCapacity'] as const;
export const splitNativeHandlers=Object.freeze(Object.fromEntries(names.map(name=>[name,(request:Request,id?:string)=>(handlers()[name] as (request:Request,id?:string)=>Promise<Response>)(request,id)]))) as unknown as NativeSplitHandlers;

