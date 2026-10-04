import assert from 'node:assert/strict';
import vm from 'node:vm';
import {assessUsdcPageZoom,readUsdcPerformanceLoads,readUsdcZoomMetrics} from './usdc-browser-dom-observations.mjs';

const before={innerWidth:1366,innerHeight:768,devicePixelRatio:1.25,visualViewport:{scale:1}};
const after={innerWidth:683,innerHeight:384,devicePixelRatio:2.5,visualViewport:{scale:1}};
assert.equal(assessUsdcPageZoom(before,after).reason,'BASELINE_100_UNCONFIRMED');
assert.equal(assessUsdcPageZoom(before,after,{baseline100Verified:true}).native200Verified,true);
for(const invalid of [
 {...after,devicePixelRatio:before.devicePixelRatio},
 {...before},
 {...after,visualViewport:{scale:2}},
 {...after,innerWidth:800},
 {...after,devicePixelRatio:NaN},
])assert.equal(assessUsdcPageZoom(before,invalid,{baseline100Verified:true}).native200Verified,false);

const origin='https://stellar-bazaar-x402-public000-cabscryptocontacto-6028s-projects.vercel.app';
const entry=(name,type='resource')=>({name,entryType:type,initiatorType:type==='navigation'?'navigation':'fetch',startTime:10,responseEnd:30,duration:20,transferSize:500,encodedBodySize:300,decodedBodySize:1000,responseStatus:200,redirectCount:0});
const resources=[
 entry(origin+'/api/operations?token=SECRET_QUERY'),
 entry(origin+'/api/activity?view=operations&cursor=SECRET_CURSOR'),
 entry(origin+'/_next/static/chunks/public-file.js?session=SECRET_SESSION'),
 entry('https://different.example/private/SECRET_PATH?session=SECRET_EXTERNAL'),
 entry(origin+'/private/SECRET_PRIVATE_PATH'),
];
const sandbox=vm.createContext({URL,window:{location:{origin},innerWidth:683,innerHeight:384,outerWidth:1400,outerHeight:900,devicePixelRatio:2.5,visualViewport:{width:683,height:384,scale:1}},document:{documentElement:{clientWidth:666,scrollWidth:666},activeElement:{tagName:'INPUT',value:'SECRET_INPUT'}},performance:{timeOrigin:123456789,now:()=>100,getEntriesByType:kind=>kind==='navigation'?[entry(origin+'/history#token=SECRET_FRAGMENT','navigation')]:resources}});
const loads=vm.runInContext('('+readUsdcPerformanceLoads.toString()+')('+JSON.stringify(origin)+')',sandbox);
assert.equal(loads.rows.length,6);assert.equal(loads.rows.filter(row=>row.kind==='api').length,2);assert.equal(loads.rows.filter(row=>row.kind==='static').length,1);assert.equal(loads.completeNetworkCapture,false);assert.equal(loads.responseRequestIdsAvailable,false);assert.equal(loads.requestBytesAvailable,false);
assert.equal(JSON.stringify(loads).includes('SECRET_'),false);assert.ok(loads.rows.every(row=>!/[?#]/.test(row.path)));
const zoom=vm.runInContext('('+readUsdcZoomMetrics.toString()+')()',sandbox);assert.equal(zoom.devicePixelRatio,2.5);assert.equal(zoom.horizontalOverflow,false);assert.equal(JSON.stringify(zoom).includes('SECRET_'),false);
assert.throws(()=>vm.runInContext('('+readUsdcPerformanceLoads.toString()+')("https://different.example")',sandbox),/AUTHORIZED_PREVIEW_REQUIRED/);
console.log(JSON.stringify({status:'PASS',nativeDprAndViewportRequired:true,baseline100Required:true,pinchAndResizeRejected:true,secretUrlsRedacted:true,networkCoverageNotOverclaimed:true,browserRequests:0,externalRequests:0,secretReads:0}));
