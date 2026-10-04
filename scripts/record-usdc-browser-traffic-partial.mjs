import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const dir='docs/evidence/sprint-marketplace/',read=async n=>JSON.parse(await readFile(dir+n+'.json','utf8'));
const m=await read('usdc-sale-manifest'),functional=await read('usdc-browser-functional');assert.equal(functional.planId,m.planId);assert.equal(functional.sourceSha,m.sourceSha);
const report={version:1,planId:m.planId,sourceSha:m.sourceSha,complete:false,requests:[],activeExecutionMs:functional.activeExecutionMs,automaticRetries:null,automaticRetriesConfigured:0,automaticRetriesScope:'configured-application-only',
 status:'PARTIAL_DOM_ONLY',limitation:'DOM and action durations were observed. No wire capture of request headers, body bytes, redirects, static resources or browser/platform retransmissions is available. Empty requests means no transport records, not zero network use.',
 internalServerRecords:'Reconciled separately from Vercel UUIDs; API headers were not read by the browser.',
 knownUnmeteredUpper:{apiRequests:1,reason:'Empty-token prime rendered UNAUTHORIZED; may precede server metering. Reserve one request rather than invent an observed UUID.'}};
await writeFile(dir+'usdc-browser-traffic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,activeExecutionMs:report.activeExecutionMs,complete:false}));
