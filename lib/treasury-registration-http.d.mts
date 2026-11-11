type Input={creationId:string;humanAccessHash:string;agentAccessHash:string};
export function treasuryRegistrationOperator(request:Request):Request|null;
export function parseTreasuryRegistrationBody(request:Request):Promise<Input>;
export function createTreasuryRegistrationHandler(options:{enabled?:boolean;operatorMatches:(request:Request)=>boolean;assertRequest:(request:Request)=>void;ingress:(request:Request)=>Promise<void>;createWorkspace:(input:Input,bootstrapHash:string,ip:string,operatorRequest:Request)=>Promise<{created:boolean;record:unknown}>;bearerHash:(authorization:string|null)=>string;trustedIp:(request:Request)=>string;creationOpen:()=>Promise<boolean>}):(request:Request)=>Promise<Response>;
