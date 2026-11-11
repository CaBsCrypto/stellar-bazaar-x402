import {createHash,timingSafeEqual} from 'node:crypto';

/** Two operator reads only. Native marketOperator authentication is mandatory
 * before either diagnostic invokes the facilitator. No Redis or external calls. */
export function marketOperatorDiagnosticKind(request:Request):'facilitator'|'payment'|undefined {
 const url=new URL(request.url),params=url.searchParams;
 if(request.method!=='GET'||url.pathname!=='/api/market/review'||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||params.getAll('diagnostic').length!==1)return;
 if(params.get('diagnostic')==='facilitator'&&params.size===1)return 'facilitator';
 const id=params.get('operationId');
 if(params.get('diagnostic')==='payment'&&params.size===2&&params.getAll('operationId').length===1&&id!==null&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))return 'payment';
}

export function marketDiagnosticBodyless(request:Request):boolean {
 const length=request.headers.get('content-length');
 return !request.headers.has('transfer-encoding')&&(length===null||length==='0');
}

/** Cheap static proof for these two read-only proxy requests. The native handler
 * authenticates independently; a bearer-shaped string alone is insufficient. */
export function marketDiagnosticOperatorMatches(request:Request,environment:Readonly<Record<string,string|undefined>>=process.env):boolean {
 const authorization=/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(request.headers.get('authorization')??''),expected=environment.BAZAAR_MARKET_OPERATOR_HASH;
 return !!authorization&&/^[a-f0-9]{64}$/.test(expected??'')&&timingSafeEqual(createHash('sha256').update(authorization[1]).digest(),Buffer.from(expected!,'hex'));
}
