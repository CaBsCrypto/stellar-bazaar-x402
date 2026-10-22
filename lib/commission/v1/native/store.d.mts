export const EXCLUDED_IDS:readonly string[];
export const SPLIT_ORDER_CAS:string;
export const SPLIT_OWNER_PAGE:string;
export function assertNewId(id:string):string;
export interface SplitOrderStore {create(row:any,idempotency:any,principal?:any):Promise<any>;read(id:string):Promise<any>;transition(id:string,revision:string,patch:any,principal?:any):Promise<any>;readOwnerPage(input:any):Promise<any>;}
export function createSplitOrderStore(options:Record<string,unknown>):SplitOrderStore;
