export const SPLIT_PRODUCTION_BLOCKERS:readonly string[];
export interface NativeSplitHandlers {
 sellerCapacity(request:Request):Promise<Response>;
 context(request:Request):Promise<Response>;terms(request:Request):Promise<Response>;create(request:Request):Promise<Response>;
 order(request:Request,id:string):Promise<Response>;challenge(request:Request,id:string):Promise<Response>;
 settle(request:Request,id:string):Promise<Response>;history(request:Request):Promise<Response>;
 deliver(request:Request,id:string):Promise<Response>;delivery(request:Request,id:string):Promise<Response>;
 reconcile(request:Request,id:string):Promise<Response>;
}
export function createSplitHttpHandlers(options:{authenticate:(request:Request,role?:'human'|'agent'|'bootstrap',allowQuery?:boolean)=>Promise<{ownerId:string;generation:number;role:string}>;[key:string]:unknown}):NativeSplitHandlers;

