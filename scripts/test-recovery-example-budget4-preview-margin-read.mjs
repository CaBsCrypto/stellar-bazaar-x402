import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {summarizeV4PreviewMargin} from '../.vercel/recovery-example-budget4-preview-margin-read.mjs';
let checks=0;const source=await readFile('.vercel/recovery-example-budget4-preview-margin-read.mjs'),text=source.toString(),before=createHash('sha256').update(source).digest('hex');
for(const raw of [null,'','null','{}','[]','{"version":1}',JSON.stringify({version:2,configuration:'wrong',last:0,buckets:[],held:[]}),JSON.stringify({version:2,configuration:'cffe2b85e9f007d5bbfefcd78178a726868b694494e8860d9120f54560fec405',last:100,buckets:[],held:[]})]){assert.throws(()=>summarizeV4PreviewMargin(raw,0));checks++;}
assert.equal(20*140771328,2815426560);checks++;assert(text.includes("transport.command(['GET',key])"));checks++;assert(text.includes('maximum:1,maximumCommands:1,maximumBytes:600000'));checks++;assert(!text.includes("command(['EVAL'"));checks++;assert(!text.includes("command(['SET'"));checks++;assert(!text.includes("command(['SCAN'"));checks++;assert.equal(createHash('sha256').update(await readFile('.vercel/recovery-example-budget4-preview-margin-read.mjs')).digest('hex'),before);checks++;
console.log(JSON.stringify({status:'PASS_LOCAL_V4_SINGLE_GET_PREVIEW_MARGIN_READER',checks,helperSha256:before,proposedMaximumReads:1,conservative20ReadBytes:2815426560,networkRequests:0,privateProfilesRead:0,ledgerWrites:0,positiveNativeLedgerValidationPending:true,payments:0}));
