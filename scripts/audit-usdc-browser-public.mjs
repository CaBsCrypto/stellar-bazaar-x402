import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Stored public, redacted observations only. No HTTP, packet, DPAPI, browser or storage API.
const directory='docs/evidence/sprint-marketplace';
const json=async name=>JSON.parse((await readFile(directory+'/'+name+'.json','utf8')).replace(/^\uFEFF/,''));
const text=async name=>readFile(directory+'/'+name+'.txt','utf8');
const [manifest,observations,sale,resources,a,b,aLocked,bLocked]=await Promise.all([
 json('usdc-sale-manifest'),json('usdc-browser-dom-observed'),json('usdc-sale-receipt'),json('usdc-browser-resource-observed'),
 text('usdc-browser-A-redacted'),text('usdc-browser-B-redacted'),text('usdc-browser-A-locked'),text('usdc-browser-B-locked'),
]);
const replacement=manifest.deployments.bazaarReplacement,origin=new URL(replacement.url).origin;
for(const value of [observations,resources]){assert.equal(value.sourceSha,manifest.sourceSha);assert.equal(value.deploymentId,replacement.id);}
assert.equal(sale.planId,manifest.planId);assert.equal(sale.sourceSha,manifest.sourceSha);assert.equal(sale.status,'PASS_CONFIRMED_SALE_RECEIPT');assert.equal(sale.currentSaleStatesMatch,true);
assert.equal(observations.origin,origin);assert.equal(observations.status,'FUNCTIONAL_OBSERVATIONS');assert.ok(Number.isFinite(Date.parse(observations.observedAt)));
for(const key of ['magicLinkA','magicLinkB','lockA','lockB','viewportReset'])assert.equal(observations[key],true,key);
for(const key of ['keyboardA','keyboardB']){assert.ok(observations[key].expanded.includes('Identidad del activo'));assert.equal(observations[key].tag,'A');assert.equal(observations[key].text,'Transacción testnet');}
assert.equal(observations.mobile.width,390);assert.equal(observations.mobile.height,844);assert.ok(observations.mobile.clientWidth>0&&observations.mobile.clientWidth<=390);assert.ok(observations.mobile.documentWidth<=observations.mobile.clientWidth);assert.ok(observations.mobile.marketWidth>0&&observations.mobile.marketWidth<=observations.mobile.clientWidth);assert.equal(observations.mobile.privateInputType,'password');
assert.equal(observations.marketplaceRefreshA,1);assert.equal(observations.marketplaceRefreshB,1);assert.equal(observations.agentChatOpened,false);assert.equal(observations.explorerOpened,false);assert.equal(observations.expectedAPI,15);
assert.ok(Number.isSafeInteger(observations.activeExecutionMs)&&observations.activeExecutionMs>0&&observations.activeExecutionMs<=90000);
assert.equal(observations.nativeZoom200,'PENDING_MANUAL');assert.equal(observations.humanFreighter,'PENDING_MANUAL');assert.equal(observations.completeBrowserTransport,false);
const renderedTextHashes=[];
for(const [name,view,perspective]of [['A',a,'Venta'],['B',b,'Compra']]){
 assert.ok(view.includes('text: <redacted>'),'ACCESS_INPUT_MUST_BE_REDACTED:'+name);assert.ok(!/#token=(?!\[REDACTED\])/.test(view),'MAGIC_LINK_NOT_REDACTED:'+name);
 assert.equal((view.match(new RegExp('heading "'+perspective+' · Guionista algorítmico de texto"','g'))??[]).length,2,'CURRENT_ORDER_PERSPECTIVE:'+name);
 for(const order of sale.orders){assert.ok(view.includes(order.operationId),'ORDER_ID_NOT_RENDERED:'+name);assert.ok(view.includes(order.transactionHash),'PAYMENT_NOT_RENDERED:'+name);assert.ok(view.includes(order.payer)&&view.includes(order.destination),'PARTICIPANTS_NOT_RENDERED:'+name);}
 assert.ok(view.includes('Entrega disponible')&&view.includes('Pago verificado · entrega fallida'),'STATES_NOT_DISTINGUISHED:'+name);
 assert.ok(view.includes(sale.orders[1].failureReason),'DECLARED_FAILURE_NOT_RENDERED:'+name);
 assert.ok(view.includes('0.01 USDC testnet')&&view.includes('generic "Identidad del activo"'),'PAYMENT_ASSET_DISCLOSURE_MISSING:'+name);
 if(name==='A')assert.ok(view.includes(manifest.config.identity.issuer)&&view.includes(manifest.config.identity.sacContract),'EXPANDED_EXACT_ASSET_NOT_RENDERED:A');
 const deliveryLine=view.split(/\r?\n/).find(line=>/^\s*- generic: "Guion algorítmico/.test(line));assert.ok(deliveryLine,'DELIVERY_TEXT_NOT_RENDERED:'+name);
 const deliveryText=JSON.parse(deliveryLine.slice(deliveryLine.indexOf('"')));
 // AX snapshots normalize whitespace. They cannot certify the original text's byte hash.
 const displayedHash=createHash('sha256').update(deliveryText.replace(/\s+/g,' ').trim()).digest('hex');renderedTextHashes.push(displayedHash);assert.ok(deliveryText.length>0&&deliveryText.length<=2000);
 if(sale.orders[0].delivery.displayWhitespaceNormalizedHash!==undefined){assert.match(sale.orders[0].delivery.displayWhitespaceNormalizedHash,/^[a-f0-9]{64}$/);assert.equal(displayedHash,sale.orders[0].delivery.displayWhitespaceNormalizedHash,'DISPLAYED_NORMALIZED_DELIVERY_HASH:'+name);assert.equal(deliveryText.replace(/\s+/g,' ').trim().length,sale.orders[0].delivery.displayWhitespaceNormalizedCharacters,'DISPLAYED_NORMALIZED_DELIVERY_LENGTH:'+name);}
}
assert.equal(renderedTextHashes[0],renderedTextHashes[1],'PARTICIPANTS_DISPLAY_DIFFERENT_TEXT');
for(const [name,view]of [['A',aLocked],['B',bLocked]]){assert.ok(view.includes('heading "Biblioteca bloqueada"'),'LOCKED_VIEW_MISSING:'+name);assert.ok(sale.orders.every(order=>!view.includes(order.operationId)&&!view.includes(order.transactionHash)),'LOCKED_VIEW_LEAKS_ORDER:'+name);assert.ok(!view.includes('Guion algorítmico ·'),'LOCKED_VIEW_LEAKS_DELIVERY:'+name);assert.ok(!/#token=(?!\[REDACTED\])/.test(view),'LOCKED_VIEW_LEAKS_ACCESS:'+name);}
const toolbarObserved=resources.assets.some(asset=>asset.origin==='https://vercel.live'&&asset.path==='/_next-live/feedback/feedback.js');
const platformJweObserved=resources.assets.some(asset=>asset.origin===origin&&asset.path==='/.well-known/vercel/jwe');
assert.equal(resources.summary.byKind.font,0);assert.equal(resources.summary.byKind.video,0);
assert.equal(manifest.readiness.canRetireSynthetic,false);assert.equal(manifest.readiness.hostedBrowserPassed,false);assert.equal(manifest.readiness.canOpen,false);
console.log(JSON.stringify({status:'PASS_PUBLIC_FUNCTIONAL_BROWSER_RECEIPTS',planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:replacement.id,ordersPerParticipant:2,displayedTextSameForParticipants:true,normalizedDisplayHashMatchesBackend:sale.orders[0].delivery.displayWhitespaceNormalizedHash!==undefined?true:null,displayWhitespaceNormalizedHash:renderedTextHashes[0],exactTextByteVerification:'separate-confirmed-backend-receipt; AX normalizes whitespace',ownerPerspectivesCorrect:true,lockClearsBothViews:true,keyboardFocusObserved:true,mobile390NoDocumentOverflow:true,activeExecutionMs:observations.activeExecutionMs,privacyScope:'owner-filtered-history-and-lock; platform privacy and transport unmeasured',toolbarObserved,platformJweObserved,actualBrowserAutomaticRetries:null,completeBrowserTransport:false,nativeZoom200:'PENDING_MANUAL',humanFreighter:'PENDING_MANUAL',cleanupApproved:false,openingApproved:false,networkRequests:0,secretReads:0}));
