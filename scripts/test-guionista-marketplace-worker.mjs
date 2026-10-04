import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Asset,Networks,Keypair} from '@stellar/stellar-sdk';
import {createGuionistaIntent,executeGuionistaIntent,deliverGuionistaIntent,failGuionistaIntent,recoverGuionistaClaim} from '../examples/guionista-marketplace-worker.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const origin='https://owned-provider-preview.vercel.app',token='p'.repeat(43);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const identity={kind:'stellar-classic-credit',network:'stellar:testnet',code:'USDC',issuer:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'};identity.sacContract=new Asset('USDC',identity.issuer).contractId(Networks.TESTNET);
const destination=Keypair.fromRawEd25519Seed(Buffer.alloc(32,1)).publicKey();
const card={id:'guionista-algorithmic-text',url:origin,routeTemplate:'/v1/marketplace-text',network:'stellar:testnet',payment:{asset:'USDC',amount:'0.01',destination,identity}};
const cardHash=hash(canonical(card));
const response=body=>({isError:false,structuredContent:body,content:[{type:'text',text:JSON.stringify(body)}]});
function fixture(){
 const intent=createGuionistaIntent({operationId:randomUUID(),cardHash,serviceId:'guionista-algorithmic-text',providerOrigin:origin});
 let order={operationId:intent.operationId,cardHash,serviceId:intent.serviceId,phase:'paid',transactionHash:'b'.repeat(64),paymentVerifiedAt:new Date().toISOString(),input:{topic:'Comunidad',durationSeconds:20,tone:'educativo'},card:structuredClone(card),destination,amount:'0.01',settlement:structuredClone(identity)};
 const calls=[],saved=[];let providerCalls=0,loseProvider=false,loseDelivery=false,loseClaim=false;
 const options={providerToken:token,persistIntent:async value=>{saved.push(structuredClone(value));},callTool:async(name,args)=>{
  calls.push(name);if(name==='list_market_orders')return response({orders:[structuredClone(order)]});
  if(name==='claim_market_order'){order={...order,phase:'executing',attemptId:args.attemptId};if(loseClaim)throw Error('LOST_CLAIM');}
  else if(name==='uncertain_market_order')order={...order,phase:'execution-uncertain',executionUncertainty:args.reason};
  else if(name==='deliver_market_order'){order={...order,phase:'delivered',delivery:{text:args.text,sha256:hash(args.text),reference:'bazaar-order:'+intent.operationId}};if(loseDelivery)throw Error('LOST_DELIVERY');}
  else if(name==='fail_market_order')order={...order,phase:'delivery-failed',failure:args.reason};
  else if(name!=='claim_market_order')throw Error('UNKNOWN_TOOL');
  return response({order:structuredClone(order)});
 },providerFetch:async(url,init)=>{providerCalls++;assert.equal(intent.phase,'provider-started');assert.equal(saved.at(-1).phase,'provider-started');assert.equal(String(url),origin+'/v1/marketplace-text');assert.equal(init.redirect,'error');const payload=JSON.parse(init.body);assert.equal(payload.attemptId,intent.attemptId);if(loseProvider)throw Error('LOST_PROVIDER');return Response.json({ok:true,operationId:intent.operationId,attemptId:intent.attemptId,text:'Texto real del generador',textHash:hash('Texto real del generador'),engine:'algorithmic',contentType:'text/plain'});}};
 return {intent,options,calls,saved,get providerCalls(){return providerCalls;},get order(){return order;},set order(value){order=value;},set loseProvider(value){loseProvider=value;},set loseDelivery(value){loseDelivery=value;},set loseClaim(value){loseClaim=value;}};
}
const success=fixture();assert.equal((await executeGuionistaIntent(success.intent,success.options)).phase,'delivered');assert.equal(success.providerCalls,1);assert.deepEqual(success.saved.map(v=>v.phase),['claim-started','claimed','provider-started','generated','delivery-started','delivered']);await assert.rejects(executeGuionistaIntent(success.intent,success.options),/EXISTING_INTENT/);await deliverGuionistaIntent(success.intent,success.options);assert.equal(success.providerCalls,1);
const unconfirmed=fixture();unconfirmed.loseProvider=true;await assert.rejects(executeGuionistaIntent(unconfirmed.intent,unconfirmed.options),/EXECUTION_UNCERTAIN/);assert.equal(unconfirmed.order.phase,'execution-uncertain');assert.equal(unconfirmed.order.transactionHash,'b'.repeat(64));await assert.rejects(executeGuionistaIntent(unconfirmed.intent,unconfirmed.options),/EXISTING_INTENT/);assert.equal(unconfirmed.providerCalls,1);assert.equal((await failGuionistaIntent(unconfirmed.intent,unconfirmed.options,'Manual failure after lost response')).phase,'delivery-failed');
const deliveryLost=fixture();deliveryLost.loseDelivery=true;await assert.rejects(executeGuionistaIntent(deliveryLost.intent,deliveryLost.options),/LOST_DELIVERY/);assert.equal(deliveryLost.intent.phase,'delivery-uncertain');assert.ok(deliveryLost.saved.some(v=>v.phase==='generated'&&v.textHash===hash(v.text)));deliveryLost.loseDelivery=false;assert.equal((await deliverGuionistaIntent(deliveryLost.intent,deliveryLost.options)).phase,'delivered');assert.equal(deliveryLost.providerCalls,1);
const failure=fixture();assert.equal((await failGuionistaIntent(failure.intent,failure.options,'Declared acceptance failure')).phase,'delivery-failed');assert.equal(failure.providerCalls,0);
const bad=fixture();bad.order={...bad.order,paymentVerifiedAt:undefined};await assert.rejects(executeGuionistaIntent(bad.intent,bad.options),/UNBOUND_OR_UNPAID/);assert.equal(bad.providerCalls,0);assert.deepEqual(bad.calls,['list_market_orders']);
const lostClaim=fixture();lostClaim.loseClaim=true;await assert.rejects(executeGuionistaIntent(lostClaim.intent,lostClaim.options),/LOST_CLAIM/);assert.equal(lostClaim.intent.phase,'claim-started');assert.equal(lostClaim.providerCalls,0);await recoverGuionistaClaim(lostClaim.intent,lostClaim.options);assert.equal(lostClaim.intent.phase,'claimed');lostClaim.loseClaim=false;await executeGuionistaIntent(lostClaim.intent,lostClaim.options);assert.equal(lostClaim.providerCalls,1);assert.equal(lostClaim.calls.filter(v=>v==='claim_market_order').length,1);
for(const mutate of [order=>order.card.payment.identity.issuer='G'+'A'.repeat(55),order=>order.card.network='stellar:mainnet',order=>order.amount='0.02',order=>order.card.description='Changed card',order=>order.settlement.code='USDT0']){const changed=fixture();const order=structuredClone(changed.order);mutate(order);changed.order=order;await assert.rejects(executeGuionistaIntent(changed.intent,changed.options),/UNBOUND_OR_UNPAID/);assert.equal(changed.providerCalls,0);}
const concurrent=fixture(),first=executeGuionistaIntent(concurrent.intent,concurrent.options);await assert.rejects(executeGuionistaIntent(structuredClone(concurrent.intent),concurrent.options),/CONCURRENT_EXECUTION/);await first;assert.equal(concurrent.providerCalls,1);
console.log(JSON.stringify({status:'PASS',scenarios:12,providerCallsInSuccessfulAttempt:1,automaticRetries:0,externalRequests:0,payments:0}));
