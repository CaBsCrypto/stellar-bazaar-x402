// Two public account reads only. No private packet, signer, funding or mutation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {StrKey} from '@stellar/stellar-sdk';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidenceRoot=resolve('docs/evidence/sprint-x402-agent');
const preparationPath=resolve(evidenceRoot,'service-preparation.json');
const issuer='GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const sac='CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const wallets=[
 ['seller','GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C'],
 ['buyer','GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU'],
];
const policy=Object.freeze({version:1,scope:'two-existing-wallets-public-read-only-preflight',origin:'https://horizon-testnet.stellar.org',method:'GET',paths:wallets.map(([,address])=>'/accounts/'+address),maxCalls:2,maxCallsPerAccount:1,maxRequestBytes:2048,maxResponseBytes:32768,timeoutMs:12000,redirects:0,retries:0,payments:0,signatures:0,friendbotClaims:0,trustlineSubmissions:0,usdcFaucetClaims:0,redisRestExchanges:0,redisCommandsUpperBound:0,minimumBuyerAvailableUsdc:'0.0200000',minimumSellerReceiveCapacityUsdc:'0.0200000',byteScope:'explicit HTTP representation; parsing cap, no physical-wire claim'});
const errorCodes=new Set(['INVALID_ARGUMENTS','OUTPUT_OUTSIDE_EVIDENCE_ROOT','SOURCE_BINDING_UNAVAILABLE','PREPARATION_IDENTITY_MISMATCH','REQUEST_BYTE_CAP','HORIZON_HTTP_REJECTED','HORIZON_ACCOUNT_NOT_FOUND','HORIZON_RESPONSE_TOO_LARGE','HORIZON_TRANSPORT_UNCERTAIN','HORIZON_INVALID_JSON','ACCOUNT_IDENTITY_MISMATCH','ACCOUNT_BALANCES_INVALID','AMOUNT_INVALID','USDC_TRUSTLINE_MISSING','USDC_TRUSTLINE_UNAUTHORIZED','BUYER_USDC_INSUFFICIENT','SELLER_USDC_RECEIVE_CAPACITY_INSUFFICIENT','JOURNAL_ALREADY_EXISTS','JOURNAL_UNCONFIRMED']);
const fail=code=>{throw Error(code);};
function atomic(value){
 if(typeof value!=='string'||!/^\d{1,12}(?:\.\d{1,7})?$/.test(value))fail('AMOUNT_INVALID');
 const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*10000000n+BigInt(fraction.padEnd(7,'0'));
 if(amount>9223372036854775807n)fail('AMOUNT_INVALID');return amount;
}
const decimal=value=>`${value/10000000n}.${(value%10000000n).toString().padStart(7,'0')}`;
function summarize(account,role,address){
 if(account?.account_id!==address)fail('ACCOUNT_IDENTITY_MISMATCH');
 if(!Array.isArray(account.balances)||account.balances.length>1000)fail('ACCOUNT_BALANCES_INVALID');
 const native=account.balances.filter(line=>line.asset_type==='native');
 const usdc=account.balances.filter(line=>line.asset_type==='credit_alphanum4'&&line.asset_code==='USDC'&&line.asset_issuer===issuer);
 if(native.length!==1)fail('ACCOUNT_BALANCES_INVALID');if(usdc.length!==1)fail('USDC_TRUSTLINE_MISSING');
 const line=usdc[0];if(line.is_authorized!==true)fail('USDC_TRUSTLINE_UNAUTHORIZED');
 const nativeBalance=atomic(native[0].balance),nativeSelling=atomic(native[0].selling_liabilities),balance=atomic(line.balance),selling=atomic(line.selling_liabilities),buying=atomic(line.buying_liabilities),limit=atomic(line.limit);
 if(nativeSelling>nativeBalance||selling>balance||balance+buying>limit)fail('ACCOUNT_BALANCES_INVALID');
 const available=balance-selling,receiveCapacity=limit-balance-buying;
 if(role==='buyer'&&available<200000n)fail('BUYER_USDC_INSUFFICIENT');
 if(role==='seller'&&receiveCapacity<200000n)fail('SELLER_USDC_RECEIVE_CAPACITY_INSUFFICIENT');
 return {role,address,network:'stellar:testnet',native:{balance:decimal(nativeBalance),sellingLiabilities:decimal(nativeSelling),availableBeforeReserve:decimal(nativeBalance-nativeSelling)},usdc:{asset:'USDC',issuer,sacContract:sac,trustlineExists:true,authorized:true,balance:decimal(balance),sellingLiabilities:decimal(selling),buyingLiabilities:decimal(buying),limit:decimal(limit),available:decimal(available),receiveCapacity:decimal(receiveCapacity),buyerFundsSufficient:role==='buyer'?available>=200000n:null,sellerReceiveCapacitySufficient:role==='seller'?receiveCapacity>=200000n:null}};
}

async function main(){
 const args=process.argv.slice(2),execute=args.includes('--execute'),outputArg=args.find(value=>value.startsWith('--output='));
 if(args.some(value=>value!=='--execute'&&value!=='--plan'&&!value.startsWith('--output='))||args.includes('--plan')&&execute)fail('INVALID_ARGUMENTS');
 const output=resolve(outputArg?.slice(9)??resolve(evidenceRoot,'existing-wallets-read-preflight-20261005-01.json'));
 const inside=relative(evidenceRoot,output);if(!inside||inside.startsWith('..')||isAbsolute(inside)||!inside.endsWith('.json'))fail('OUTPUT_OUTSIDE_EVIDENCE_ROOT');
 const raw=await readFile(preparationPath);if(raw.length>2097152)fail('PREPARATION_IDENTITY_MISMATCH');const draft=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
 try{
  assert.match(draft.planId,/^[a-f0-9-]{36}$/);assert.equal(draft.participants.length,2);
  assert.deepEqual(draft.participants.map(p=>[p.role,p.wallet]),wallets);wallets.forEach(([,address])=>assert.equal(StrKey.isValidEd25519PublicKey(address),true));
  assert.equal(draft.config.identity.network,'stellar:testnet');assert.equal(draft.config.identity.code,'USDC');assert.equal(draft.config.identity.issuer,issuer);assert.equal(draft.config.identity.sacContract,sac);
 }catch{fail('PREPARATION_IDENTITY_MISMATCH');}
 if(!execute){console.log(JSON.stringify({status:'PLAN_ONLY',planId:draft.planId,preparationSHA256:sha(raw),policy,policySHA256:sha(JSON.stringify(policy)),networkRequests:0}));return;}
 let sourceSha;try{const {stdout}=await promisify(execFile)('git',['rev-parse','HEAD'],{windowsHide:true,maxBuffer:4096});sourceSha=stdout.trim();assert.match(sourceSha,/^[a-f0-9]{40}$/);}catch{fail('SOURCE_BINDING_UNAVAILABLE');}
 await mkdir(evidenceRoot,{recursive:true});
 const report={schemaVersion:1,kind:'x402-existing-wallets-public-preflight',status:'PENDING',planId:draft.planId,sourceSha,preparationSHA256:sha(raw),policy,policySHA256:sha(JSON.stringify(policy)),startedAt:new Date().toISOString(),counters:{apiRequests:0,redisRestExchanges:0,redisCommandsUpperBound:0,outboundPayloadBytes:0,inboundPayloadBytes:0,paymentSubmissionIntents:0,friendbotClaims:0,trustlineSubmissions:0,usdcFaucetClaims:0},attempts:[],limitations:['Native availability does not subtract the Stellar minimum account reserve.','No signer, auth-entry, SAC simulation or ability to settle is inferred from these account reads.','Balances are point-in-time observations; no funds are added or wallets changed.']};
 // Exclusive durable journal before any fetch. A crash/PENDING file is retained.
 try{await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true,mode:0o600});}catch(error){fail(error.code==='EEXIST'?'JOURNAL_ALREADY_EXISTS':'JOURNAL_UNCONFIRMED');}
 const persist=async()=>{try{await writeFile(output,JSON.stringify(report,null,2)+'\n',{flush:true,mode:0o600});}catch{fail('JOURNAL_UNCONFIRMED');}};
 try{
  for(const [role,address]of wallets){
   if(report.attempts.length>=policy.maxCalls)fail('INVALID_ARGUMENTS');
   const path='/accounts/'+address,url=new URL(path,policy.origin);assert.ok(policy.paths.includes(url.pathname)&&url.origin===policy.origin&&!url.search&&!url.hash);
   const headers=new Headers({accept:'application/json','user-agent':'Bazaar-x402-existing-wallet-preflight/1'});
   const outgoing=Buffer.byteLength(`GET ${url.pathname} HTTP/1.1\r\nhost: ${url.host}\r\n`)+Array.from(headers).reduce((n,[key,value])=>n+Buffer.byteLength(`${key}: ${value}\r\n`),2);
   if(outgoing>policy.maxRequestBytes)fail('REQUEST_BYTE_CAP');
   const entry={role,address,method:'GET',origin:policy.origin,path,status:'PENDING',startedAt:new Date().toISOString(),reservedResponseBytes:policy.maxResponseBytes};
   report.attempts.push(entry);report.counters.apiRequests++;report.counters.outboundPayloadBytes+=outgoing;report.counters.inboundPayloadBytes+=policy.maxResponseBytes;await persist();
   let observed=0,responseComplete=false,reader;
   try{
    const response=await fetch(url,{method:'GET',headers,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(policy.timeoutMs)});
    entry.httpStatus=response.status;
    observed=Buffer.byteLength(`HTTP/1.1 ${response.status} ${response.statusText}\r\n`)+Array.from(response.headers).reduce((n,[key,value])=>n+Buffer.byteLength(`${key}: ${value}\r\n`),2);
    if(observed>policy.maxResponseBytes){await response.body?.cancel();fail('HORIZON_RESPONSE_TOO_LARGE');}
    const chunks=[];reader=response.body?.getReader();if(reader)for(;;){const next=await reader.read();if(next.done)break;observed+=next.value.byteLength;if(observed>policy.maxResponseBytes){await reader.cancel();fail('HORIZON_RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(next.value));}
    const bytes=Buffer.concat(chunks);responseComplete=true;entry.responseSHA256=sha(bytes);entry.inboundPayloadBytes=observed;entry.completedAt=new Date().toISOString();
    report.counters.inboundPayloadBytes-=policy.maxResponseBytes-observed;
    if(!response.ok){entry.status='HTTP_REJECTED';fail(response.status===404?'HORIZON_ACCOUNT_NOT_FOUND':'HORIZON_HTTP_REJECTED');}
    let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{entry.status='RESPONSE_REJECTED';fail('HORIZON_INVALID_JSON');}
    try{entry.summary=summarize(data,role,address);}catch(error){entry.status='RESPONSE_REJECTED';throw error;}
    entry.status='CONFIRMED';await persist();
   }catch(error){
    await reader?.cancel().catch(()=>{});
    if(entry.status==='PENDING'){entry.status=responseComplete?'RESPONSE_REJECTED':'UNCERTAIN';entry.partialResponseBytes=observed;if(!responseComplete)report.counters.inboundPayloadBytes+=Math.max(0,observed-policy.maxResponseBytes);}
    entry.errorCode=errorCodes.has(error.message)?error.message:'HORIZON_TRANSPORT_UNCERTAIN';report.status='WALLET_PREFLIGHT_STOPPED_NO_RETRY';await persist();throw error;
   }
  }
  report.status='PASS_REAL_EXISTING_WALLETS_PUBLIC_PREFLIGHT';report.completedAt=new Date().toISOString();await persist();
  console.log(JSON.stringify({status:report.status,planId:report.planId,sourceSha,report:relative(process.cwd(),output),counters:report.counters,accounts:report.attempts.map(entry=>entry.summary),signatures:0,payments:0}));
 }catch(error){report.status='WALLET_PREFLIGHT_STOPPED_NO_RETRY';try{await persist();}catch{}throw error;}
}
main().catch(error=>{console.error(JSON.stringify({status:'WALLET_PREFLIGHT_STOPPED_NO_RETRY',code:errorCodes.has(error.message)?error.message:'LOCAL_PREFLIGHT_FAILURE',automaticRetries:0,payments:0,signatures:0}));process.exitCode=1;});
