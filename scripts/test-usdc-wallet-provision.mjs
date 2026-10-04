import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Keypair,Asset,Networks,TransactionBuilder} from '@stellar/stellar-sdk';
import {issuer,solveFaucetPow,provisioningBinding,createProvisioner} from './provision-usdc-sale-wallets.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');
function fixture({loseFriendbot=false,loseTrustline=false,ready=true,leanReceipts=false}={}){
 const keys=[Keypair.random(),Keypair.random()],wallets=keys.map(key=>({publicKey:key.publicKey(),secret:key.secret()}));
 const identity={kind:'stellar-classic-credit',network:'stellar:testnet',code:'USDC',issuer,sacContract:new Asset('USDC',issuer).contractId(Networks.TESTNET)};
 const manifest={planId:'test-provision',sourceSha:'c'.repeat(40),config:{identity},participants:wallets.map(v=>({wallet:v.publicKey})),limits:{friendbotClaims:2,trustlineSubmissions:2,usdcFaucetClaims:1,faucetApiRequests:2,horizonReads:24,maxFeeStroopsPerTransaction:1000,inboundPayloadBytes:33554432,outboundPayloadBytes:16777216,activeExecutionSeconds:300},readiness:{canProvision:ready,canInspectProvisioning:true,localSaleMeasured:true,payloadsFrozen:true}};manifest.provisioningBinding=provisioningBinding(manifest);
 const packet={sale:{planId:manifest.planId,wallets}},report={status:'IN_PROGRESS',counts:{horizonReads:0,friendbotClaims:0,trustlineSubmissions:0,faucetApiRequests:0,usdcFaucetClaims:0},attempts:[],inboundPayloadBytes:0,outboundPayloadBytes:0};
 const accounts=new Map(),requests=[],saved=[];
 const account=address=>({account_id:address,sequence:'1000',subentry_count:0,num_sponsoring:0,num_sponsored:0,thresholds:{med_threshold:0},signers:[{key:address,weight:1}],balances:[{asset_type:'native',balance:'10000.0000000'}]});
 const fetcher=async(url,init)=>{
  requests.push(String(url));assert.equal(init.redirect,'error');const target=new URL(url);
  assert.equal(saved.at(-1).report.attempts.at(-1).status,'PENDING');
  if(target.hostname==='friendbot.stellar.org'){
   const address=target.searchParams.get('addr');accounts.set(address,account(address));if(loseFriendbot)throw Error('LOST_FRIENDBOT');return Response.json(leanReceipts?{hash:sha(address),result_meta_xdr:'synthetic'}:{successful:true,hash:sha(address)});
  }
  if(target.hostname==='horizon-testnet.stellar.org'){
   if(target.pathname.startsWith('/accounts/')){const value=accounts.get(target.pathname.split('/').at(-1));return value?Response.json(value):Response.json({title:'not found'},{status:404});}
   const tx=TransactionBuilder.fromXDR(new URLSearchParams(init.body).get('tx'),Networks.TESTNET);const current=accounts.get(tx.source);assert.equal(tx.operations.length,1);assert.equal(tx.operations[0].type,'changeTrust');assert.equal(tx.operations[0].line.getCode(),'USDC');assert.equal(tx.operations[0].line.getIssuer(),issuer);assert.equal(Number(tx.fee),100);
   const privateSaved=saved.at(-1).packet.sale.provisioning.wallets.find(v=>v.publicKey===tx.source);assert.equal(privateSaved.trustline.transactionHash,tx.hash().toString('hex'));assert.ok(privateSaved.trustline.signedXdr);assert.equal(report.attempts.at(-1).transactionHash,privateSaved.trustline.transactionHash);
   current.subentry_count=1;current.sequence='1001';current.balances.push({asset_type:'credit_alphanum4',asset_code:'USDC',asset_issuer:issuer,balance:'0.0000000',limit:'922337203685.4775807',buying_liabilities:'0.0000000',is_authorized:true});if(loseTrustline)throw Error('LOST_TRUSTLINE');return Response.json({successful:true,hash:tx.hash().toString('hex'),ledger:900});
  }
  const payload=JSON.parse(init.body);
  if(target.pathname.endsWith('/challenge'))return Response.json({prefix:'sozu-faucet-v1',challengeId:'test-challenge-id',to:payload.to,difficulty:8});
  assert.equal(target.pathname,'/api/v1/faucet/claim');assert.equal(payload.to,wallets[1].publicKey);assert.equal(payload.pow.challengeId,'test-challenge-id');accounts.get(payload.to).balances[1].balance='1.0000000';return Response.json(leanReceipts?{success:true}:{success:true,to:payload.to,amount:1,transactionHash:sha('USDC-funded')});
 };
 const runner=createProvisioner({manifest,packet,report,fetcher,persistPacket:async value=>{saved.push({packet:structuredClone(value),report:structuredClone(report)});},persistReport:async()=>{}});
 return {runner,packet,report,requests,saved};
}
const good=fixture();const result=await good.runner.provision();assert.equal(good.packet.sale.provisioning.phase,'complete');assert.equal(good.report.status,'PASS_PROVISIONED');assert.deepEqual(result.counts,{horizonReads:7,friendbotClaims:2,trustlineSubmissions:2,faucetApiRequests:2,usdcFaucetClaims:1});assert.equal(result.wallets[1].usdcBalance,'1.0000000');for(const wallet of good.packet.sale.wallets)assert.equal(JSON.stringify(good.report).includes(wallet.secret),false);assert.equal(JSON.stringify(good.report).includes('signedXdr'),false);const total=good.requests.length;await assert.rejects(good.runner.provision(),/ALREADY_COMPLETE/);assert.equal(good.requests.length,total);
for(const setting of [{loseFriendbot:true},{loseTrustline:true}]){const lost=fixture(setting);await assert.rejects(lost.runner.provision(),/OUTCOME_UNCONFIRMED/);assert.equal(lost.report.status,'UNCERTAIN');const count=lost.requests.length;await assert.rejects(lost.runner.provision(),/UNCERTAIN_STOP/);assert.equal(lost.requests.length,count);assert.equal(lost.report.attempts.at(-1).status,'UNCERTAIN');const observed=await lost.runner.inspect();assert.equal(observed[0].exists,true);assert.equal(lost.report.status,'UNCERTAIN');assert.equal(lost.requests.length,count+2);}
const unready=fixture({ready:false});await assert.rejects(unready.runner.provision(),/PROVISION_PLAN_NOT_READY/);assert.equal(unready.requests.length,0);
const lean=fixture({leanReceipts:true});await lean.runner.provision();assert.equal(lean.report.status,'PASS_PROVISIONED');assert.equal(lean.packet.sale.provisioning.wallets[1].usdcBalance,'1.0000000');
assert.throws(()=>solveFaucetPow({prefix:'wrong',to:'A',challengeId:'x',difficulty:8},'A'),/UNBOUND/);assert.throws(()=>solveFaucetPow({prefix:'sozu-faucet-v1',to:'B',challengeId:'x',difficulty:8},'A'),/UNBOUND/);assert.throws(()=>solveFaucetPow({prefix:'sozu-faucet-v1',to:'A',challengeId:'x',difficulty:25},'A'),/UNBOUND/);assert.throws(()=>solveFaucetPow({prefix:'sozu-faucet-v1',to:'A',challengeId:'x',difficulty:24},'A',{maxHashes:1}),/LIMIT/);
console.log(JSON.stringify({status:'PASS_LOCAL_PROVISION_DOUBLES',horizonReads:7,friendbotClaims:2,trustlines:2,faucetApiRequests:2,faucetClaims:1,networkRequests:0,automaticRetries:0,seedsLogged:false}));
