import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,open,lstat,mkdir} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {openPortableSecretStore} from '../examples/buyer-portable-secret-store.mjs';
import {assertOpenExecutionGate,openAssert,openHash} from './open-acceptance-plan.mjs';
import {createOpenAcceptanceController,createOpenRedisExchange} from './open-acceptance-controller.mjs';
import {createExistingOpenPrivateRuntime,existingBuyerStoreDirectory} from './open-existing-buyer-runtime.mjs';

/** DPAPI payload is sent on stdin; no secret reaches argv, environment or logs. */
export function openDpapi(bytes,{decrypt=false,spawnImpl=spawn}={}){
  openAssert(process.platform==='win32'&&bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=1048576,'BOUNDED_WINDOWS_DPAPI_REQUIRED');
  const operation=decrypt?'Unprotect':'Protect';
  const script="$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$taskInput=[Console]::In.ReadToEnd();$taskBytes=[Convert]::FromBase64String($taskInput);$taskResult=[Security.Cryptography.ProtectedData]::"+operation+"($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($taskResult))";
  return new Promise((accept,reject)=>{const child=spawnImpl('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',failed=false;
    child.stdout.on('data',value=>{output+=value;if(output.length>2097152){failed=true;child.kill();}});child.stderr.on('data',()=>{failed=true;});child.on('error',()=>reject(Error('DPAPI_PROCESS_UNAVAILABLE')));
    child.on('close',code=>{if(code||failed||!output||!/^[A-Za-z0-9+/]+={0,2}$/.test(output))reject(Error('DPAPI_UNCONFIRMED'));else accept(Buffer.from(output,'base64'));});child.stdin.end(Buffer.from(bytes).toString('base64'));
  });
}
async function regular(path){const info=await lstat(path);openAssert(info.isFile()&&!info.isSymbolicLink()&&info.size>0&&info.size<=1048576,'PRIVATE_REGULAR_FILE_REQUIRED');}
export async function readOpenDpapiJson(path,{historical=false}={}){
  await regular(path);let encrypted=await readFile(path);if(historical){openAssert(basename(path)==='workspace-v1.dpapi','HISTORICAL_PACKET_PATH_REQUIRED');encrypted=Buffer.from(encrypted.toString('utf8'),'base64');}
  const clear=await openDpapi(encrypted,{decrypt:true});try{return JSON.parse(clear);}finally{clear.fill(0);encrypted.fill(0);}
}
export async function writeNewOpenDpapiJson(path,value){
  openAssert(basename(path)!=='workspace-v1.dpapi'&&path.endsWith('.dpapi'),'NEW_PRIVATE_HANDOFF_PATH_REQUIRED');
  const clear=Buffer.from(JSON.stringify(value));let encrypted;try{encrypted=await openDpapi(clear);}finally{clear.fill(0);}const file=await open(path,'wx',0o600);try{await file.writeFile(encrypted);await file.sync();}finally{encrypted.fill(0);await file.close();}
}
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function durableStore(directory,passwordFile){
  let password;
  if(!await exists(passwordFile)){password=randomBytes(32);await writeNewOpenDpapiJson(passwordFile,{version:1,directory,password:password.toString('base64url')});}
  else{const value=await readOpenDpapiJson(passwordFile);openAssert(value.version===1&&value.directory===directory&&typeof value.password==='string','PRIVATE_STORE_HANDOFF_CHANGED');password=Buffer.from(value.password,'base64url');}
  try{return await openPortableSecretStore({directory,password,create:!await exists(directory)});}finally{password.fill(0);}
}
/** Only root owns this session; specialists never receive secret handles.
 * Controller credentials contain no wallet. The historical packet remains read-only. */
export async function openHostedPrivateSession({plan,authorization,privateDirectory,historicalPacketPath,preparation=false,readRecovery=false,compactJournal}){
  await assertOpenExecutionGate({plan,...authorization,preparation,readOnly:readRecovery});
  openAssert(typeof compactJournal==='function','REVIEWED_COMPACT_CONTROLLER_JOURNAL_REQUIRED');
  privateDirectory=resolve(privateDirectory);historicalPacketPath=resolve(historicalPacketPath);
  openAssert(basename(privateDirectory)==='.vercel'&&basename(historicalPacketPath)==='workspace-v1.dpapi','EXACT_PRIVATE_HANDOFF_DIRECTORY_REQUIRED');
  const control=await readOpenDpapiJson(resolve(privateDirectory,'open-controller-access.dpapi'));
  openAssert(control.version===1&&control.redisOrigin===plan.redisOrigin&&typeof control.redisCredential==='string'&&control.redisCredential.length>0&&control.redisCredential.length<=4096&&!/[\r\n]/.test(control.redisCredential),'EXACT_PRIVATE_REDIS_HANDOFF_REQUIRED');
  const controllerDirectory=resolve(privateDirectory,'open-controller-'+plan.planId),store=await durableStore(controllerDirectory,controllerDirectory+'.dpapi');
  const release=await store.acquireLock('open-acceptance');let controller;
  try{controller=await createOpenAcceptanceController({plan,authorization,preparation,readRecovery,journal:compactJournal({store,name:'open.'+plan.planId}),redisExchange:createOpenRedisExchange({origin:plan.redisOrigin,credential:control.redisCredential,planId:plan.planId})});}
  catch(error){await release();store.dispose();throw error;}finally{delete control.redisCredential;}
  let ownerStore;
  return {controller,store,
    async credentialProvider(){const path=resolve(process.env.APPDATA??'','com.vercel.cli','Data','auth.json');await regular(path);const value=JSON.parse(await readFile(path,'utf8'));openAssert(typeof value.token==='string'&&value.token.length>0&&value.token.length<=4096,'EXISTING_VERCEL_AUTH_REQUIRED');return value.token;},
    async loadPrivateRuntime({index,readOnly,controller:active=controller}){
      const directory=existingBuyerStoreDirectory(historicalPacketPath,plan.participants[1].ownerId,plan.participants[1].wallet);
      // Creating/opening an empty encrypted store never loads the wallet packet.
      ownerStore??=await durableStore(directory,directory+'.dpapi');
      return createExistingOpenPrivateRuntime({plan,authorization,index,readOnly,controller:active,ownerStore,ownerStoreDirectory:directory,historicalPacketPath,
        readHistoricalFileHash:async()=>openHash(await readFile(historicalPacketPath)),loadHistoricalPacket:()=>readOpenDpapiJson(historicalPacketPath,{historical:true})});
    },
    async close(){try{await controller.close();}finally{ownerStore?.dispose();await release();store.dispose();}}
  };
}
