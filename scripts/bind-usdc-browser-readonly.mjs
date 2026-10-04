import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evidence/sprint-marketplace/',read=async n=>JSON.parse(await readFile(dir+n+'.json','utf8'));
const m=await read('usdc-sale-manifest'),local=await read('usdc-public-history-html-local'),assets=await read('usdc-toolbar-assets');
assert.equal(local.status,'PASS_LOCAL_PUBLIC_HTML_MEASUREMENT');assert.equal(local.sourceSha,m.sourceSha);assert.equal(assets.status,'PASS');assert.equal(assets.apiRequests,2);
assert.notEqual(m.readiness.canOpen,true);assert.equal(m.browserReserve.apiRequests,20);
assert.equal(m.deployments.bazaarReplacement.readyState,'READY');
assert.ok(!m.browserReadOnlyExecution,'BROWSER_EXECUTION_ALREADY_FROZEN');
const allStatic=local.staticAssets.files.reduce((n,v)=>n+v.bytes,0);
const model={version:1,sourceSha:m.sourceSha,deploymentId:m.deployments.bazaarReplacement.id,origin:new URL(m.deployments.bazaarReplacement.url).origin,
 pageNavigationsUpper:4,alreadyUsedNavigations:1,remainingNavigations:['replacement-empty-token-prime','magic-link-A','magic-link-B'],
 expectedPrivateApi:15,apiReserve:20,expectedPrimeApi:1,perIdentityInitialApi:5,perIdentityRefreshApi:2,
 maxHtmlBodyBytes:local.bodyBytes*8,fullStaticSetBytes:allStatic,apiBodyUpperBytes:1048576,
 bootstrapSetBytes:assets.inboundPayloadBytes,faviconPerNavigationBytes:65536,headersPerNavigationBytes:131072,
 activeBrowserSecondsUpper:90,reloadsAllowed:0,catalogNavigationsAllowed:0,refreshesPerIdentity:1,automaticTransportRetriesConfigured:0,
 retriesObserved:'not-captured',completeBrowserTransport:false,canOpen:false,
 limitations:['Bounds model the four controlled document loads and source-constrained private GETs; they do not retrospectively prove absence of platform feedback calls or browser retransmissions.','Native 200% zoom and human Freighter remain pending.']};
model.inboundControlledJourneyUpperBytes=4*(model.maxHtmlBodyBytes+allStatic+model.bootstrapSetBytes+model.faviconPerNavigationBytes+model.headersPerNavigationBytes)+20*model.apiBodyUpperBytes;
assert.ok(model.inboundControlledJourneyUpperBytes+1128788<m.limits.inboundPayloadBytes,'MODEL_EXCEEDS_INBOUND_LIMIT');
const bytes=JSON.stringify(model,null,2)+'\n';await writeFile(dir+'usdc-browser-readonly-budget.json',bytes);
m.browserReadOnlyExecution={budgetSha256:createHash('sha256').update(bytes).digest('hex'),maxApiRequests:20,expectedApiRequests:15,maxActiveSeconds:90,readOnly:true,retries:0,openingApproved:false};
m.readiness.canRetireSynthetic=false;m.readiness.hostedBrowserPassed=false;m.readiness.canOpen=false;
await writeFile(dir+'usdc-sale-manifest.json',JSON.stringify(m,null,2)+'\n');
console.log(JSON.stringify({status:'FROZEN_READ_ONLY_BROWSER',inboundControlledJourneyUpperBytes:model.inboundControlledJourneyUpperBytes,completeBrowserTransport:false,cleanupApproved:false,canOpen:false}));
