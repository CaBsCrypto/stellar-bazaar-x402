import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evidence/sprint-marketplace/',json=async n=>JSON.parse(await readFile(dir+n+'.json','utf8'));
const m=await json('usdc-sale-manifest'),observed=await json('usdc-browser-dom-observed'),sale=await json('usdc-sale-receipt');
const deployment=m.deployments.bazaarReplacement;
assert.equal(observed.sourceSha,m.sourceSha);assert.equal(observed.deploymentId,deployment.id);assert.equal(observed.origin,new URL(deployment.url).origin);
assert.ok(observed.magicLinkA&&observed.magicLinkB&&observed.lockA&&observed.lockB&&observed.viewportReset);
assert.equal(observed.keyboardA.text,'Transacción testnet');assert.equal(observed.keyboardB.text,'Transacción testnet');assert.equal(observed.mobile.width,390);assert.ok(observed.mobile.documentWidth<=observed.mobile.clientWidth);
assert.equal(sale.currentSaleStatesMatch,true);
for(const [role,perspective]of [['A','Venta'],['B','Compra']]){
 const dom=await readFile(dir+'usdc-browser-'+role+'-redacted.txt','utf8'),locked=await readFile(dir+'usdc-browser-'+role+'-locked.txt','utf8');
 for(const order of sale.orders){assert.ok(dom.includes(order.operationId)&&dom.includes(order.transactionHash));assert.ok(!locked.includes(order.operationId));}
 assert.ok(dom.includes(perspective+' · Guionista algorítmico de texto'));assert.ok(dom.includes('Entrega disponible')&&dom.includes('Pago verificado · entrega fallida')&&dom.includes('0.01 USDC testnet'));
 assert.ok(dom.includes('Stop scrolling! The secret about Una comunidad de desarrolladores changes everything.'));
 assert.ok(!locked.includes('Stop scrolling!'));if(role==='B')assert.ok(!dom.includes(m.payloads.submissionId));
}
const receipt={version:1,planId:m.planId,sourceSha:m.sourceSha,deploymentId:deployment.id,origin:observed.origin,status:'PASS_FUNCTIONAL_MANUAL_GATES_PENDING',purpose:'synthetic-cleanup-only',
 checks:{magicLinkA:'PASS',magicLinkB:'PASS',lockClearsView:'PASS',keyboard:'PASS',mobile390:'PASS',readsSameRecords:'PASS',privacy:'PASS'},
 checkMethods:{magicLink:'Existing DPAPI-held access recovered via one-use localhost link to protected replacement; fragment removed by application.',records:'Both order IDs, transaction hashes, perspectives, amounts and separate states match the independently audited backend receipt; text visible in both views.',privacy:'B sees purchase records without seller submission/legacy activity; locked views clear IDs, wallet and text. Third-party rejection is the pre-existing hosted HTTP 401 check.',keyboard:'Space opens the native asset disclosure; Tab focuses transaction link.',mobile:'Actual 390x844 viewport; document scrollWidth does not exceed clientWidth; override reset.'},
 manual:{nativeZoom200:'PENDING_MANUAL',humanFreighter:'PENDING_MANUAL'},expectedGeneration:3,automaticRetries:0,
 automaticRetriesScope:'Application transport configured with no retries; browser/platform retransmissions were not captured.',
 serviceId:m.payloads.serviceId,submissionId:m.payloads.submissionId,sellerOwnerId:m.participants[0].ownerId,sellerWorkspaceId:m.participants[0].workspaceId,buyerOwnerId:m.participants[1].ownerId,buyerWorkspaceId:m.participants[1].workspaceId,
 orderIds:m.payloads.orders.map(v=>v.operationId),activeExecutionMs:observed.activeExecutionMs,
 navigation:{sessionAlreadyAuthenticated:true,ssoPageObserved:false,privateOrigin:observed.origin,additionalHostedNavigations:3,localhostOneUseHandoffs:2},
 browserTransportComplete:false,cleanupApproved:false,cleanupPendingReason:'Platform feedback/JWE traffic and possible retransmissions lack a demonstrated total byte bound; do not authorize more Redis effects from the conditional model.',canOpen:false,hostedBrowserPassed:false,
 evidence:['usdc-browser-A-redacted.txt','usdc-browser-B-redacted.txt','usdc-browser-A-locked.txt','usdc-browser-B-locked.txt','usdc-browser-dom-observed.json','usdc-browser-resource-observed.json','usdc-browser-mobile.png','usdc-browser-desktop.png']};
const bytes=JSON.stringify(receipt,null,2)+'\n';await writeFile(dir+'usdc-browser-functional.json',bytes);
m.cleanupReceipt={sha256:createHash('sha256').update(bytes).digest('hex'),status:'FUNCTIONAL_PASS_CLEANUP_PENDING_MEASUREMENT'};
m.readiness.canRetireSynthetic=false;m.readiness.hostedBrowserPassed=false;m.readiness.canOpen=false;
await writeFile(dir+'usdc-sale-manifest.json',JSON.stringify(m,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,cleanupApproved:false,canOpen:false,activeExecutionMs:observed.activeExecutionMs}));
