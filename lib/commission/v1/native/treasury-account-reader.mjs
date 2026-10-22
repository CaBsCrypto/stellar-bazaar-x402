import {createHash} from 'node:crypto';
import {TREASURY} from '../policy-router/fee-split-policy-v1.mjs';
export const TREASURY_ACCOUNT_URL=`https://horizon-testnet.stellar.org/accounts/${TREASURY}`;
export const USDC_ISSUER='GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const sha=v=>createHash('sha256').update(v).digest('hex');
function atomic(value){need(typeof value==='string'&&/^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(value),'TREASURY_ACCOUNT_AMOUNT_INVALID');return BigInt(value.replace('.',''));}
/** Single pinned GET, no signing, creation, writes, polling or retries. This
 * validates a fresh trusted Horizon response, not a consensus inclusion proof. */
export function createTreasuryAccountReader({enabled=false,fetcher,now=Date.now,timeoutMs=5000}={}){
 return async function read(){
  need(enabled===true,'TREASURY_CHAIN_READER_DISABLED');need(typeof fetcher==='function'&&Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=5000,'TREASURY_CHAIN_READER_UNAVAILABLE');
  const controller=new AbortController();let timer,reader;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('TREASURY_CHAIN_READ_TIMEOUT'));},timeoutMs);});
  const bounded=p=>Promise.race([p,expired]);
  try{
   const response=await bounded(fetcher(TREASURY_ACCOUNT_URL,{method:'GET',headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:controller.signal}));
   need(response?.status===200&&response.redirected!==true&&(!response.url||response.url===TREASURY_ACCOUNT_URL),'TREASURY_CHAIN_RESPONSE_REJECTED');
   need(response.headers?.get('content-type')?.split(';')[0].trim()==='application/json','TREASURY_CHAIN_CONTENT_TYPE_INVALID');
   const length=response.headers.get('content-length');need(length===null||/^[0-9]+$/.test(length)&&Number(length)<=65536,'TREASURY_CHAIN_RESPONSE_BOUND');
   let headerBytes=0;for(const [k,v] of response.headers)headerBytes+=Buffer.byteLength(k+':'+v);need(headerBytes<=8192,'TREASURY_CHAIN_RESPONSE_BOUND');
   reader=response.body?.getReader();need(reader,'TREASURY_CHAIN_BODY_REQUIRED');let bytes=headerBytes;const chunks=[];
   for(;;){const item=await bounded(reader.read());if(item.done)break;need(item.value instanceof Uint8Array,'TREASURY_CHAIN_BODY_INVALID');bytes+=item.value.byteLength;need(bytes<=65536,'TREASURY_CHAIN_RESPONSE_BOUND');chunks.push(item.value);}
   const raw=Buffer.concat(chunks);let account;try{account=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw Error('TREASURY_CHAIN_JSON_INVALID');}
   need(account?.account_id===TREASURY&&Array.isArray(account.balances)&&account.balances.length<=128&&typeof account.sequence==='string'&&/^[0-9]{1,20}$/.test(account.sequence),'TREASURY_ACCOUNT_MISMATCH');
   const lines=account.balances.filter(v=>v.asset_code==='USDC'&&v.asset_issuer===USDC_ISSUER&&v.asset_type==='credit_alphanum4');need(lines.length===1&&lines[0].is_authorized===true,'TREASURY_USDC_RECEIVING_UNAVAILABLE');
   const line=lines[0],available=atomic(line.limit)-atomic(line.balance)-atomic(line.buying_liabilities);need(available>=1500n,'TREASURY_USDC_RECEIVING_UNAVAILABLE');
   const observedAt=now();need(Number.isSafeInteger(observedAt)&&observedAt>0,'TREASURY_CHAIN_CLOCK_INVALID');
   return Object.freeze({version:'bazaar.treasury-account-observation/v1',account:TREASURY,network:'stellar:testnet',issuer:USDC_ISSUER,asset:'USDC',observedAt,availableToReceiveAtomic:available.toString(),accountDataHash:sha(raw),source:TREASURY_ACCOUNT_URL,consensusProofVerified:false});
  }finally{clearTimeout(timer);controller.abort();if(reader){try{void reader.cancel().catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}}
 };
}
