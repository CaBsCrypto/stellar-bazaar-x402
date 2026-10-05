import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {analyseBrowserCapture} from './x402-browser-capture.mjs';

function fixture(){
 const origin='http://127.0.0.1:12345',paths=['/','/redirect','/target','/partial','/sse','/ws','/favicon.ico'],statuses=[200,302,200,200,200,101,204],sizes=[50,0,16,14,55,0,0];
 const header=(name,value)=>({name,value});
 const entries=paths.map((path,index)=>({startedDateTime:new Date(1700000000000+index*1000).toISOString(),request:{url:origin+path,method:'GET',bodySize:0,headersSize:80,headers:[header('Authorization','private-not-public')],httpVersion:'HTTP/1.1'},response:{status:statuses[index],statusText:'Fixture',bodySize:sizes[index],headersSize:90,headers:path==='/redirect'?[header('Location','/target')]:[],content:{mimeType:path==='/sse'?'text/event-stream':'text/plain'},...(path==='/redirect'?{redirectURL:origin+'/target'}:{})},cache:{}}));
 const events=paths.flatMap((path,index)=>[
  {type:'REQUEST_ALIVE',phase:1,time:index*1000,source:{id:index+1,type:'URL_REQUEST'},params:{}},
  {type:'URL_REQUEST_START_JOB',phase:1,time:index*1000,source:{id:index+1,type:'URL_REQUEST'},params:{url:origin+path,method:'GET'}},
  {type:'HTTP_STREAM_JOB_BOUND_TO_SOCKET',phase:0,time:index*1000,source:{id:index+1,type:'URL_REQUEST'},params:{source_dependency:{id:100+index,type:'SOCKET'}}},
  {type:'SOCKET_BYTES_SENT',phase:0,time:index*1000,source:{id:100+index,type:'SOCKET'},params:{byte_count:80}},
  {type:'SOCKET_BYTES_RECEIVED',phase:0,time:index*1000,source:{id:100+index,type:'SOCKET'},params:{byte_count:90+sizes[index]+(path==='/ws'?20:0)}},
  {type:'URL_REQUEST_JOB_BYTES_READ',phase:0,time:index*1000,source:{id:index+1,type:'URL_REQUEST'},params:{byte_count:sizes[index]}},
  {type:'REQUEST_ALIVE',phase:2,time:index*1000+10,source:{id:index+1,type:'URL_REQUEST'},params:{net_error:path==='/partial'?-354:0}},
 ]);
 events.push({type:'WEB_SOCKET_READ_FRAME_HEADER',phase:0,time:6000,source:{id:105,type:'SOCKET'},params:{header:{payload_length:16}}});
 const netlog={constants:{timeTickOffset:1700000000000,logEventTypes:{},logSourceType:{}},events};
 const session={version:1,segmentId:randomUUID(),evidenceKind:'parser-fixture',scope:'entire-isolated-browser-network-stack-session',browserVersion:'Synthetic parser fixture; not Chrome',exclusiveBrowserInstance:true,startedBeforeFirstNavigation:true,stoppedAfterNetworkQuiet:true,maxHttpRequests:20,maxOutboundBytes:10000,maxInboundBytes:10000};
 const ledger={status:'PASS_LOCAL_STIMULUS',origin,cases:{redirect:true,partial:true,sse:true,websocket:true},requests:paths.map((path,index)=>({path,method:'GET',status:statuses[index],requestBodyBytes:0,responseBodyBytes:sizes[index]}))};
 return {har:{log:{entries}},netlog,session,fixture:ledger};
}
let scenarios=0;const check=(change,code)=>{const value=fixture();change(value);const result=analyseBrowserCapture(value);assert.equal(result.captureComplete,false);assert.ok(result.failures.includes(code),code);scenarios++;};
const good=analyseBrowserCapture(fixture());assert.equal(good.status,'PASS_PARSER_FIXTURE');assert.equal(good.validationComplete,true);assert.equal(good.captureComplete,false);assert.equal(good.physicalWireObserved,false);assert.equal(good.coverage.httpRetries,0);assert.equal(good.coverage.partialResponses,1);assert.equal(good.coverage.httpRedirects,1);assert.equal(good.coverage.sseResponses,1);assert.equal(good.coverage.websocketUpgrades,1);assert.ok(!JSON.stringify(good).includes('private-not-public'));scenarios++;
check(v=>v.har.log.entries[0].request.bodySize=-1,'HAR_REQUEST_BODY_SIZE_UNKNOWN');
check(v=>{v.har.log.entries[3].response.bodySize=-1;v.netlog.events=v.netlog.events.filter(e=>e.source.id!==4||e.type!=='URL_REQUEST_JOB_BYTES_READ');},'HAR_RESPONSE_BODY_SIZE_UNKNOWN');
const partial=fixture();partial.har.log.entries[3].response.bodySize=-1;assert.equal(analyseBrowserCapture(partial).requests.find(r=>r.path==='/partial').responseBodyBytes,14);scenarios++;
check(v=>v.netlog.events=v.netlog.events.filter(e=>e.type!=='SOCKET_BYTES_SENT'),'SOCKET_DIRECTION_COVERAGE_REQUIRED');
check(v=>v.netlog.events=v.netlog.events.filter(e=>e.type!=='HTTP_STREAM_JOB_BOUND_TO_SOCKET'),'HTTP_SOCKET_DEPENDENCY_COVERAGE_REQUIRED');
check(v=>v.netlog.events=v.netlog.events.filter(e=>e.type!=='WEB_SOCKET_READ_FRAME_HEADER'),'WEBSOCKET_FRAME_EVIDENCE_REQUIRED');
check(v=>v.har.log.entries.pop(),'NETLOG_REQUEST_MISSING_FROM_HAR');
check(v=>v.netlog.events=v.netlog.events.filter(e=>e.type!=='REQUEST_ALIVE'||e.phase!==2),'URL_REQUEST_TERMINAL_EVENT_REQUIRED');
check(v=>v.netlog.events.push({type:'QUIC_SESSION_PACKET_RECEIVED',source:{id:50,type:'QUIC_SESSION'},params:{byte_count:1}}),'QUIC_TRANSPORT_NOT_SUPPORTED');
check(v=>v.netlog.events.push({type:'HTTP_TRANSACTION_RESTART_AFTER_ERROR',source:{id:50,type:'HTTP_TRANSACTION'},params:{}}),'HTTP_TRANSPORT_RETRY_OBSERVED');
check(v=>v.session.stoppedAfterNetworkQuiet=false,'SESSION_BOUNDARY_NOT_CONFIRMED');
check(v=>v.session.maxInboundBytes=1,'FROZEN_CAPTURE_BUDGET_EXCEEDED');
check(v=>v.har.log.entries[0]._fromCache=true,'CACHE_OR_SERVICE_WORKER_UNVERIFIED');
check(v=>v.fixture.requests[2].responseBodyBytes++,'FIXTURE_BODY_BYTE_MISMATCH');
const duplicated=fixture();duplicated.netlog.events.push({type:'SSL_SOCKET_BYTES_RECEIVED',source:{id:1,type:'URL_REQUEST'},params:{byte_count:1000000}});assert.equal(analyseBrowserCapture(duplicated).totals.browserInboundBytesUpperBound,good.totals.browserInboundBytesUpperBound);scenarios++;
console.log(JSON.stringify({status:'PASS',scenarios,scope:'synthetic parser fixtures only; not a native capture',captureComplete:false,remoteRequests:0,secretReads:0}));
