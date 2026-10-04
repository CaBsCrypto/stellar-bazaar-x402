import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPacket} from './marketplace-private-packet.mjs';
const dir='docs/evidence/sprint-marketplace/',m=JSON.parse(await readFile(dir+'usdc-sale-manifest.json','utf8'));
const packet=await loadPacket(),sale=packet.sale,sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
assert.equal(sale.planId,m.planId);assert.ok(sale.completed.includes('sale'));assert.equal(sale.orders.length,2);
const orders=sale.orders.map(({original:o},index)=>{
 assert.equal(o.operationId,m.payloads.orderIntents[index].operationId);assert.equal(o.phase,index===0?'delivered':'delivery-failed');assert.ok(o.paymentVerifiedAt);
 if(o.delivery)assert.equal(sha(o.delivery.text),o.delivery.sha256);
 return {operationId:o.operationId,phase:o.phase,serviceId:o.serviceId,cardHash:o.cardHash,version:o.card.version,amount:o.amount,identity:o.settlement,payer:o.payer,destination:o.destination,memoHash:o.memoHash,transactionHash:o.transactionHash,paymentVerifiedAt:o.paymentVerifiedAt,createdAt:o.createdAt,updatedAt:o.updatedAt,attemptId:o.attemptId,delivery:o.delivery?{textHash:o.delivery.sha256,characters:o.delivery.text.length,utf8Bytes:Buffer.byteLength(o.delivery.text),displayWhitespaceNormalizedHash:sha(o.delivery.text.replace(/\s+/g,' ').trim()),displayWhitespaceNormalizedCharacters:o.delivery.text.replace(/\s+/g,' ').trim().length,reference:o.delivery.reference,recordedAt:o.delivery.recordedAt}:null,failureReason:o.failure??null,fullRecordHash:sha(o)};
});
const currentHistory=role=>sale.histories[role].filter(o=>o.cardHash===m.payloads.cardHash).sort((a,b)=>a.operationId.localeCompare(b.operationId));
const currentA=currentHistory('a'),currentB=currentHistory('b');assert.equal(currentA.length,2);assert.equal(currentB.length,2);
assert.ok(currentA.every(o=>o.perspective==='sale'));assert.ok(currentB.every(o=>o.perspective==='purchase'));
const stateOnly=records=>records.map(({perspective,...state})=>state);
assert.equal(sha(stateOnly(currentA)),sha(stateOnly(currentB)),'CURRENT_SALE_RECORDS_DIFFER');
const report={status:'PASS_CONFIRMED_SALE_RECEIPT',planId:m.planId,sourceSha:m.sourceSha,completedPhases:sale.completed,orders,historyHashes:{a:sha(sale.histories.a),b:sha(sale.histories.b)},entireHistoryViewsIdentical:JSON.stringify(sale.histories.a)===JSON.stringify(sale.histories.b),currentSaleHistoryHashes:{a:sha(currentA),b:sha(currentB)},currentSaleStateHashes:{a:sha(stateOnly(currentA)),b:sha(stateOnly(currentB))},currentSaleHistoryCounts:{a:currentA.length,b:currentB.length},currentSaleStatesMatch:true,perspectives:{a:'sale',b:'purchase'},localJsonProjectionBytes:{historyA:Buffer.byteLength(JSON.stringify({orders:sale.histories.a})),historyB:Buffer.byteLength(JSON.stringify({orders:sale.histories.b}))},externalRequests:0,credentialFieldsExported:0};
try{const previous=await readFile(dir+'usdc-sale-receipt.json');try{await readFile(dir+'usdc-sale-receipt-before-dom-hash.json');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(dir+'usdc-sale-receipt-before-dom-hash.json',previous,{flag:'wx'});}}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(dir+'usdc-sale-receipt.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,orders:orders.map(o=>({operationId:o.operationId,phase:o.phase,textHash:o.delivery?.textHash??null})),externalRequests:0}));
