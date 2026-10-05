import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseServiceCardShape} from '../lib/service-card-schema.ts';
import {validateServiceCard} from '../lib/discovery.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {isCanonicalUsdcTestnet} from '../lib/payment-assets.ts';

// Public preparation only. No credentials, Redis, Vercel, signer or network access.
const output=resolve(process.argv[2]??'docs/evidence/sprint-x402-agent/service-preparation.json');
const previous=JSON.parse(await readFile('docs/evidence/sprint-marketplace/usdc-sale-manifest.json','utf8'));
const previousWorkspace=JSON.parse(await readFile('docs/evidence/sprint-marketplace/hosted-workspace-manifest.json','utf8'));
assert.equal(computeCanonicalServiceCardHash(previous.payloads.card),previous.payloads.cardHash,'HISTORICAL_CARD_CHANGED');
const card=structuredClone(previous.payloads.card);
card.id='guionista-algorithmic-text-x402-pilot';
card.name='Guionista algorítmico de texto · x402';
card.description='Guion algorítmico de 15 a 30 segundos, por tema y tono. Compra por agente con 0,01 USDC testnet directo al vendedor; entrega de hasta 2000 caracteres recuperable en el pedido privado.';
card.payment.marketplace={protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'};
card.tags=[...new Set([...card.tags,'x402'])];
card.delivery={
 mode:'async',estimatedDurationMs:500,
 result:{schemaVersion:'guionista-text/v1',contentType:'text/plain',terminalStatuses:['delivered','delivery-failed'],hash:{algorithm:'sha256',required:true,scope:'canonical-result'}},
 status:{required:true,urlTemplate:'/api/market/orders/{operationId}',pollAfterMs:2000},
 callback:{supported:false,required:false,authentication:'none'},
 retention:{resultTtlHours:0,durable:true},
 idempotency:{required:true,key:'Idempotency-Key',replay:'return-original'},
 retry:{retryable:false,maxAttempts:1,failureSemantics:'terminal-error'},
};
const parsed=parseServiceCardShape(card);
assert.equal(parsed.ok,true,'NEW_CARD_SHAPE_INVALID');
assert.deepEqual(parsed.card,card,'CARD_FIELDS_MUST_BE_PRESERVED');
assert.equal(validateServiceCard(card).some(result=>result.status==='fail'),false);
assert.equal(isCanonicalUsdcTestnet(card.payment.identity),true);
assert.equal(card.payment.amount,'0.01');
assert.equal(card.url,previous.payloads.providerOrigin);
const buyer=previous.participants.find(value=>value.role==='buyer');
const seller=previous.participants.find(value=>value.role==='seller');
assert.equal(card.payment.destination,seller.wallet);
const input=structuredClone(previous.payloads.input);
const cardHash=computeCanonicalServiceCardHash(card);
const orders=Array.from({length:2},(_,index)=>({operationId:randomUUID(),attemptId:randomUUID(),expected:index===0?'delivered':'delivery-failed'}));
const payloads={submissionId:randomUUID(),serviceId:card.id,card,cardHash,
 submission:{card,controlProof:{method:'http-well-known',domain:new URL(card.url).hostname}},
 input,orders:orders.map(order=>({...order,create:{operationId:order.operationId,serviceId:card.id,cardHash,payer:buyer.wallet,input,paymentProtocol:card.payment.marketplace.protocol}})),
 pause:{action:'pause'},resume:{action:'resume'},failureReason:'Fallo declarado de entrega después de confirmar el pago x402 testnet.',
 reviewActions:[{submissionId:null,action:'verify-http'},{submissionId:null,action:'approve',reason:'Control HTTPS y contrato x402 USDC Circle testnet revisados. Compra privada por agente y entrega algorítmica externa con intención durable.'},{submissionId:null,action:'activate'}],
 price:'0.01',amountAtomic:'100000',assetIdentity:card.payment.identity,
 priorOperationIds:previous.payloads.orders.map(order=>order.operationId),
 closure:{withdrawServiceIds:[previous.payloads.serviceId,card.id],revokeOwnerId:seller.ownerId,preserveOwnerId:buyer.ownerId}};
payloads.submission.submissionId=payloads.submissionId;
for(const action of payloads.reviewActions)action.submissionId=payloads.submissionId;
payloads.pauseOperationId=randomUUID();
payloads.pauseCreate={...payloads.orders[0].create,operationId:payloads.pauseOperationId};
payloads.revocation={action:'revoke',expectedGeneration:3};
payloads.pauseWorkspaceProbe=structuredClone(previousWorkspace.payloads.pauseProbe);
const keys={written:[...previous.keys.written,previous.config.dynamicPrefix+':card:'+card.id,previous.config.marketPrefix+':x402-settlements:state'],ownerKeys:previous.keys.ownerKeys,historicalOrders:'READ-PRESERVE-EXACT'};
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
const packet={version:1,status:'PUBLIC_PREPARATION_ONLY',planId:randomUUID(),sourceSha,
 sourceBinding:{candidateCommitted:false,finalShaRequired:true},
 storageAllocation:{workspace:7000,market:18000,review:8500,catalog:5000,settlement:10664},
 config:{...previous.config,facilitatorRequests:null,facilitatorOrigin:'https://channels.openzeppelin.com',facilitatorPath:'/x402/testnet',rpcOrigin:'https://soroban-testnet.stellar.org',
  purchases:false,creationPaused:true,marketplaceX402:false,legacyX402Payments:false,usdt0Payments:false,providerOrigin:card.url,previewProtectionRequired:true,
  marketplaceOrigin:null,maximumSpendAtomic:'200000',automaticRetries:0},
 deployments:{application:null,replacement:null,provider:{stableAlias:card.url,previousDeploymentId:'dpl_6vzckCnGuTd2UocjmWpjeaLRebPw',newProofDeploymentId:null}},
 participants:previous.participants,keys,runtime:{status:'PENDING_MEASURED_REQUEST_PROFILES',requestBudgets:{},reserves:null},payloads,
 pending:['Commit and review final source SHA','Measure native local route with retained Classic data','Validate manual browser HAR and NetLog preflight','Bind exact protected Preview deployments and origin','Install new public control challenge on same provider alias','Measure and reserve hosted recovery and closure traffic'],
 remoteRequests:0,credentialReads:0,payments:0,canExecute:false,canOpen:false};
packet.config.catalogValueCaps={[previous.payloads.serviceId]:2250,[card.id]:2250};
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:packet.status,planId:packet.planId,serviceId:card.id,cardHash,cardPayloadBytes:Buffer.byteLength(JSON.stringify(card)),remoteRequests:0,payments:0}));
