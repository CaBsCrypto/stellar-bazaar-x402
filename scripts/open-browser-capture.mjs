import {analyseBrowserCapture} from './x402-browser-capture.mjs';
import {openAssert,openHash} from './open-acceptance-plan.mjs';

/** CUA DOM/screenshot evidence cannot certify transport coverage or physical wire. */
export function openDomEvidence({plan,deployment,segmentId,snapshot,screenshotBytes,viewport,zoomPercent,keyboardVerified=false,mobileVerified=false}){
 openAssert(deployment.sourceSha===plan.sourceSha&&deployment.origin===plan.origin&&/^[a-f0-9-]{36}$/.test(segmentId),'SOURCE_BOUND_DOM_CAPTURE_REQUIRED');
 openAssert(typeof snapshot==='string'&&snapshot.length>0&&viewport&&Number.isInteger(viewport.width)&&Number.isInteger(viewport.height)&&Number.isFinite(zoomPercent)&&zoomPercent>0,'ACTUAL_DOM_VIEWPORT_ZOOM_REQUIRED');
 return {version:1,kind:'source-bound-dom-evidence',planHash:plan.planHash,sourceSha:plan.sourceSha,deploymentId:deployment.id,origin:plan.origin,segmentId,domSha256:openHash(snapshot),...(screenshotBytes?{screenshotSha256:openHash(screenshotBytes)}:{}),viewport,zoomPercent,keyboardVerified,mobileVerified,captureComplete:false,networkVerified:false,physicalWireObserved:false,status:'DOM_ONLY_INCOMPLETE',limitation:'DOM and screenshot hashes support the visible state only. Aggregate reservation is a ceiling; no HAR/NetLog/per-request network capture was supplied.'};
}
export function openNetworkCapture({plan,deployment,segment,har,netlog,session}){
 openAssert(session?.binding?.planId===plan.planId&&session.binding.sourceSha===plan.sourceSha&&session.binding.deploymentId===deployment.id&&session.binding.origin===plan.origin&&session.segmentId===segment.segmentId,'SOURCE_BOUND_NETWORK_CAPTURE_REQUIRED');
 const report=analyseBrowserCapture({har,netlog,session});const profile=plan.profiles[segment.profile];openAssert(profile?.kind==='browser','FROZEN_BROWSER_BOUNDS_REQUIRED');
 const observed={httpRequests:report.totals.httpRequests,outboundBytes:report.totals.browserOutboundBytesUpperBound,inboundBytes:report.totals.browserInboundBytesUpperBound};
 for(const [key,value]of Object.entries(observed))openAssert(Number.isSafeInteger(value)&&value<=profile.reservation[key],'BROWSER_AGGREGATE_BOUND_EXCEEDED:'+key);
 return {version:1,kind:'source-bound-browser-network-evidence',planHash:plan.planHash,sourceSha:plan.sourceSha,deploymentId:deployment.id,origin:plan.origin,segmentId:segment.segmentId,captureComplete:report.captureComplete===true,networkVerified:report.captureComplete===true,physicalWireObserved:false,status:report.status,networkSha256:openHash(report),report,limitation:report.limitation};
}
