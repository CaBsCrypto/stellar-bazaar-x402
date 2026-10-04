import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';
const directory=await mkdtemp(join(tmpdir(),'bazaar-sale-lock-test-')),planId=randomUUID();
try{
 const first=await acquireSaleEffectLock(directory,planId);await assert.rejects(acquireSaleEffectLock(directory,planId),/LOCKED_EXPLICIT_RECOVERY/);await first.release();
 const second=await acquireSaleEffectLock(directory,planId);await second.preserve();await assert.rejects(acquireSaleEffectLock(directory,planId),/LOCKED_EXPLICIT_RECOVERY/);
 console.log(JSON.stringify({status:'PASS',concurrentEffectsDenied:true,staleUncertainLockPreserved:true,secrets:0,externalRequests:0}));
}finally{await rm(directory,{recursive:true,force:true});}
