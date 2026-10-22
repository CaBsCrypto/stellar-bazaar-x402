import {createHash,timingSafeEqual} from 'node:crypto';
import {guardianCronConfiguration} from './demo-configuration.ts';
import {WorkspaceError} from './workspace-types.ts';

/** Static machine proof, safe to use in the proxy before any durable store.
 * Authentication still runs again in the native guardian handler. */
export function assertMarketGuardianCronRequest(request:Request,environment:Readonly<Record<string,string|undefined>>=process.env){
 const authorization=/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(request.headers.get('authorization')??'');
 const expected=environment.BAZAAR_MARKET_OPERATOR_HASH;
 if(!authorization||!/^[a-f0-9]{64}$/.test(expected??'')||!timingSafeEqual(createHash('sha256').update(authorization[1]).digest(),Buffer.from(expected!,'hex')))throw new WorkspaceError('UNAUTHORIZED',401);
 const configuration=guardianCronConfiguration(environment);
 if(!configuration.credentialConfigured||!configuration.operatorHashMatches)throw new WorkspaceError('GUARDIAN_CRON_NOT_CONFIGURED',503);
 if(request.headers.has('origin'))throw new WorkspaceError('ORIGIN_FORBIDDEN',403);
 const url=new URL(request.url),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(request.method!=='GET'||url.pathname!=='/api/market/guardian/tick'||url.search||url.hash||url.username||url.password||request.headers.has('transfer-encoding')||(request.headers.has('content-length')&&request.headers.get('content-length')!=='0')||(url.protocol!=='https:'&&(environment.VERCEL==='1'||!local||url.protocol!=='http:')))throw new WorkspaceError('INVALID_REQUEST',400);
}

/** Only Vercel's own immutable production hostname can supplement the public
 * origin for this machine route. Never accept a caller-provided forwarded host. */
export function trustedMarketGuardianDeploymentOrigin(environment:Readonly<Record<string,string|undefined>>=process.env){
 if(environment.VERCEL!=='1'||environment.VERCEL_ENV!=='production'||!/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(environment.VERCEL_URL??''))return undefined;
 return 'https://'+environment.VERCEL_URL;
}
