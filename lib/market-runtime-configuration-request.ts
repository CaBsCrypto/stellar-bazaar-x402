import {marketDiagnosticOperatorMatches} from './market-operator-diagnostic-origin.ts';

export const MARKET_RUNTIME_CONFIGURATION_PATH='/api/internal/market-configuration';
export const MARKET_RUNTIME_CONFIGURATION_HEADERS={
 'Cache-Control':'private, no-store, max-age=0',
 'Vary':'Authorization',
 'Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff',
} as const;
type Environment=Readonly<Record<string,string|undefined>>;
type Failure={code:'UNAUTHORIZED'|'INVALID_REQUEST';status:401|400};

/** Same existing static operator proof as native diagnostic reads. This guard
 * never opens a store, credits a principal or trusts a forwarded origin. */
export function marketRuntimeConfigurationRequestFailure(request:Request,environment:Environment):Failure|undefined{
 if(!marketDiagnosticOperatorMatches(request,environment))return {code:'UNAUTHORIZED',status:401};
 try{
  const url=new URL(request.url);
  const immutable=environment.VERCEL==='1'&&environment.VERCEL_ENV==='production'&&/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(environment.VERCEL_URL??'')?'https://'+environment.VERCEL_URL:undefined;
  if(request.method!=='GET'||url.protocol!=='https:'||url.pathname!==MARKET_RUNTIME_CONFIGURATION_PATH||url.search||url.hash||url.username||url.password||url.origin!=='https://bazaar.browns.studio'&&url.origin!==immutable||request.headers.has('origin')||request.headers.has('transfer-encoding')||request.body!==null||request.headers.has('content-length')&&request.headers.get('content-length')!=='0')return {code:'INVALID_REQUEST',status:400};
 }catch{return {code:'INVALID_REQUEST',status:400};}
}
