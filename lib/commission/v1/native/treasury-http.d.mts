export function treasuryOperatorRequest(request:Request):Request|null;
export function createTreasuryHttpHandlers(options:{authenticate:(request:Request,role?:'human',allowQuery?:boolean)=>Promise<any>;operatorMatches:(request:Request)=>boolean;store?:any;enabled?:boolean}):Readonly<{GET:(request:Request)=>Promise<Response>;POST:(request:Request)=>Promise<Response>}>;
