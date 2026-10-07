import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {validateOpenLocalHandoff} from './open-private-handoff.mjs';
import {openDpapi,writeNewOpenDpapiJson,openHostedPrivateSession} from './open-hosted-private-session.mjs';
const nonce='n'.repeat(43),token='synthetic-local-redis-token',body=Buffer.from(new URLSearchParams({nonce,redisCredential:token}).toString());
const input={method:'POST',path:'/handoff',requestOrigin:'http://127.0.0.1:3117',cookie:'bazaar_handoff='+nonce,nonce,body};let checks=0;
assert.deepEqual(validateOpenLocalHandoff(input),{version:1,redisOrigin:'https://smooth-dory-323957.upstash.io',redisCredential:token});checks++;
for(const change of [{method:'GET'},{path:'/elsewhere'},{requestOrigin:'https://evil.invalid'},{cookie:'bazaar_handoff=wrong'},{nonce:'wrong'},{body:Buffer.alloc(8193)},{body:Buffer.from(body.toString()+'&redisCredential=duplicate')},{body:Buffer.from(body.toString()+'&extra=1')},{body:Buffer.from(new URLSearchParams({nonce,redisCredential:'bad\ncredential-long-enough'}).toString())}]){assert.throws(()=>validateOpenLocalHandoff({...input,...change}));checks++;}
await assert.rejects(()=>writeNewOpenDpapiJson('workspace-v1.dpapi',{}),/NEW_PRIVATE_HANDOFF_PATH_REQUIRED/);checks++;
let reads=0;
await assert.rejects(()=>openHostedPrivateSession({plan:{status:'INVALID'},authorization:{},privateDirectory:'missing-private-file',historicalPacketPath:'workspace-v1.dpapi',compactJournal:()=>{reads++;}}),/FROZEN_PLAN_CHANGED/);assert.equal(reads,0);checks++;
const inputBytes=Buffer.from('synthetic DPAPI stdin bytes');let argv,options,stdin;
const spawnImpl=(...args)=>{[,...argv]=args;options=args[2];const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={end(value){stdin=value;queueMicrotask(()=>{child.stdout.emit('data',Buffer.from(Buffer.from('synthetic encrypted bytes').toString('base64')));child.emit('close',0);});}};child.kill=()=>{};return child;};
assert.equal((await openDpapi(inputBytes,{spawnImpl})).toString(),'synthetic encrypted bytes');assert.equal(stdin,inputBytes.toString('base64'));assert.ok(!JSON.stringify(argv).includes(inputBytes.toString()));assert.equal(options.windowsHide,true);assert.deepEqual(options.stdio,['pipe','pipe','pipe']);checks++;
console.log(JSON.stringify({status:'PASS_LOCAL_PRIVATE_HANDOFF',checks,remoteRequests:0,walletReads:0,realCredentials:0,realPayments:0}));
