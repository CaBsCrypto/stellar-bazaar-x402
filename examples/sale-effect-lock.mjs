import {mkdir,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';

/** Shared by effect runners before decrypting a packet. Never auto-remove stale locks. */
export async function acquireSaleEffectLock(directory,planId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId??''))throw Error('INVALID_SALE_LOCK_ID');
 await mkdir(directory,{recursive:true});const path=join(directory,'sale-'+planId+'.lock');
 let handle;try{handle=await open(path,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('SALE_EFFECT_LOCKED_EXPLICIT_RECOVERY_REQUIRED');throw error;}
 try{await handle.writeFile(JSON.stringify({version:1,planId})+'\n');await handle.sync();}catch(error){await handle.close();throw error;}
 let closed=false;
 return {
  async release(){if(closed)return;closed=true;await handle.close();await unlink(path);},
  async preserve(){if(closed)return;closed=true;await handle.close();},
 };
}
