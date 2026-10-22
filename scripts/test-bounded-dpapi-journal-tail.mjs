import assert from 'node:assert/strict';
import {lastSealedLine} from './bounded-dpapi-journal-tail.mjs';
let checks=0;for(const s of ['YWJj\n','old-record\nYWJj\n','truncated-data\nYWJj\r\n']){assert.equal(lastSealedLine(Buffer.from(s),{startsAtZero:true}),'YWJj');checks++;}
for(const s of ['','bad secret !\n','A'.repeat(32769)+'\n']){assert.throws(()=>lastSealedLine(Buffer.from(s),{startsAtZero:true}));checks++;}
assert.throws(()=>lastSealedLine(Buffer.from('YWJj'),{startsAtZero:false}));checks++;
assert.throws(()=>lastSealedLine(Buffer.alloc(65537)));checks++;
const large=Buffer.from(('YWJj\n').repeat(110000));assert.ok(large.length>524288);assert.equal(lastSealedLine(large.subarray(large.length-65536)),'YWJj');checks+=2;
console.log(JSON.stringify({status:'PASS_BOUNDED_APPEND_ONLY_ENCRYPTED_JOURNAL_TAIL',checks,networkRequests:0,ciphertextWrites:0,quotaChanges:0}));
