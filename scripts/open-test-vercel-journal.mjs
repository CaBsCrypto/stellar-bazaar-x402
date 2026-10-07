import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {openPortableSecretStore} from '../examples/buyer-portable-secret-store.mjs';
import {createOpenVercelJournal} from './open-vercel-transport.mjs';

const root=await mkdtemp(resolve('.','.tmp-open-vercel-journal-'));
const password=Buffer.from('synthetic-local-only-password');let store;
function memoryStore(){const records=new Map(),heads=new Map();let failHead=false;return {
 records,heads,set failHead(value){failHead=value;},async read(name){return structuredClone(records.get(name));},async write(name,value,{createOnly}={}){if(createOnly&&records.has(name))throw Object.assign(Error('exists'),{code:'EEXIST'});records.set(name,structuredClone(value));},journal(name){return {async read(){if(!heads.has(name))throw Object.assign(Error('missing'),{code:'ENOENT'});return structuredClone(heads.get(name));},async initialize(value){if(heads.has(name))throw Error('exists');if(failHead)throw Error('SYNTHETIC_HEAD_FSYNC_FAILURE');heads.set(name,structuredClone(value));},async append(value){if(failHead)throw Error('SYNTHETIC_HEAD_FSYNC_FAILURE');heads.set(name,structuredClone(value));}};}};}
try{
 // Three durable snapshots per request, at 600 unique uploads, exceed a generic
 // full-snapshot journal. Here immutable revisions carry only new array tails.
 const memory=memoryStore(),compact=createOpenVercelJournal({store:memory,name:'vercel.scale'});const value={version:1,pending:false,observed:{httpRequests:0},traces:[],uploads:[],uploadAttempts:[]};await compact.initialize(value);let fullSnapshotBytes=JSON.stringify(value).length;
 for(let i=0;i<600;i++)for(let phase=0;phase<3;phase++){value.pending=phase!==2;if(phase===0)value.uploadAttempts.push({digest:i});if(phase===1)value.traces.push({request:i,status:'CONFIRMED',outboundSha256:'a'.repeat(64),inboundSha256:'b'.repeat(64)});if(phase===2){value.uploads.push({digest:i});value.observed.httpRequests++;}fullSnapshotBytes+=JSON.stringify(value).length;await compact.append(value);}
 assert.ok(fullSnapshotBytes>16*1048576);assert.deepEqual(await createOpenVercelJournal({store:memory,name:'vercel.scale'}).read(),value);assert.equal(memory.records.size,1801);assert.ok(JSON.stringify([...memory.records.values()]).length<2*1048576);
 const orphanStore=memoryStore(),orphan=createOpenVercelJournal({store:orphanStore,name:'vercel.orphan'});await orphan.initialize({traces:[],uploads:[],uploadAttempts:[],pending:false});orphanStore.failHead=true;await assert.rejects(orphan.append({traces:[],uploads:[],uploadAttempts:[],pending:true}),/FSYNC_FAILURE/);orphanStore.failHead=false;assert.equal((await orphan.read()).pending,false);await assert.rejects(orphan.append({traces:[],uploads:[],uploadAttempts:[],pending:true}),{code:'EEXIST'});assert.equal(orphanStore.records.size,2);
 store=await openPortableSecretStore({directory:join(root,'encrypted'),password,create:true});const journal=createOpenVercelJournal({store,name:'vercel.encrypted'});await journal.initialize({traces:[],uploads:[],uploadAttempts:[],pending:false,privateReference:'SYNTHETIC_PRIVATE_JOURNAL_VALUE'});
 for(let i=0;i<12;i++)await journal.append({traces:[{request:i}],uploads:[],uploadAttempts:[],pending:false,privateReference:'SYNTHETIC_PRIVATE_JOURNAL_VALUE'});
 assert.equal((await createOpenVercelJournal({store,name:'vercel.encrypted'}).read()).traces[0].request,11);
 const names=await readdir(join(root,'encrypted'));for(const name of names){const bytes=await readFile(join(root,'encrypted',name));assert.ok(!bytes.includes(Buffer.from('SYNTHETIC_PRIVATE_JOURNAL_VALUE')));}assert.ok((await stat(join(root,'encrypted','vercel.encrypted.head.journal'))).size<32768);
 const recordPath=join(root,'encrypted','vercel.encrypted.r5.sealed'),raw=await readFile(recordPath,'utf8'),envelope=JSON.parse(raw);envelope.ciphertext=(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1);await writeFile(recordPath,JSON.stringify(envelope)+'\n');await assert.rejects(createOpenVercelJournal({store,name:'vercel.encrypted'}).read(),/STORE_AUTHENTICATION_FAILED/);
 // A same-process head rollback and an authenticated revision change are also
 // rejected. Whole-directory backup rollback still requires owner protection.
 const currentHead=structuredClone(memory.heads.get('vercel.scale.head'));memory.heads.set('vercel.scale.head',{...currentHead,sequence:0});await assert.rejects(compact.read(),/COUNTER_ROLLBACK/);memory.heads.set('vercel.scale.head',currentHead);memory.records.get('vercel.scale.r7').previous='c'.repeat(64);await assert.rejects(createOpenVercelJournal({store:memory,name:'vercel.scale'}).read(),/REVISION_UNCONFIRMED/);
 console.log(JSON.stringify({status:'PASS_LOCAL_OPEN_VERCEL_JOURNAL',logicalUploads:600,durableSnapshots:1801,fullSnapshotBudgetWouldOverflow:true,compactImmutableRevisions:true,encryptedRecordsAndHead:true,tamperRejected:true,orphanBlocksNextWrite:true,inProcessRollbackRejected:true,remoteRequests:0,credentialReads:0,deploymentEffects:0}));
}finally{store?.dispose();password.fill(0);const rel=relative(resolve('.'),resolve(root));assert.ok(rel&&rel!=='..'&&!rel.startsWith('..'+sep));await rm(root,{recursive:true,force:true});}
