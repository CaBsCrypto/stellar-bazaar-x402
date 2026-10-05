import {spawn} from 'node:child_process';
import {readFile,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,platform} from 'node:os';
import {randomUUID} from 'node:crypto';

export const packetDirectory=join(tmpdir(),'bazaar-marketplace-acceptance-encrypted');
export const packetPath=join(packetDirectory,'workspace-v1.dpapi');
function protect(input,decrypt=false){
 if(platform()!=='win32')throw Error('WINDOWS_DPAPI_REQUIRED');
 const script=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$taskInput=[Console]::In.ReadToEnd();$taskBytes=${decrypt?'[Convert]::FromBase64String($taskInput)':'[Text.Encoding]::UTF8.GetBytes($taskInput)'};$taskResult=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write(${decrypt?'[Text.Encoding]::UTF8.GetString($taskResult)':'[Convert]::ToBase64String($taskResult)'})`;
 return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let result='',failed=false;child.stdout.on('data',v=>{result+=v;if(result.length>1048576){failed=true;child.kill();}});child.stderr.on('data',()=>{failed=true;});child.on('error',()=>reject(Error('DPAPI_PROCESS_UNAVAILABLE')));child.on('close',code=>code||failed?reject(Error('DPAPI_FAILED')):resolve(result));child.stdin.end(input);});
}
/** Replacement never opens the retained packet for writing. The temporary contains encrypted bytes only. */
export async function writeEncryptedPacketFile(path,encrypted,{initial=false,io={open,rename,unlink},temporaryId=randomUUID}={}){
 if(typeof encrypted!=='string'||encrypted.length===0||Buffer.byteLength(encrypted)>1048576)throw Error('PRIVATE_PACKET_ENCRYPTED_BYTES_INVALID');
 if(initial){const handle=await io.open(path,'wx',0o600);try{await handle.writeFile(encrypted,'utf8');await handle.sync();}finally{await handle.close();}return;}
 const temporary=path+'.replacement-'+temporaryId()+'.tmp';let handle,temporaryOwned=false;
 try{
  handle=await io.open(temporary,'wx',0o600);temporaryOwned=true;
  await handle.writeFile(encrypted,'utf8');await handle.sync();await handle.close();handle=undefined;
  await io.rename(temporary,path);temporaryOwned=false;
 }catch{throw Error('PRIVATE_PACKET_ATOMIC_SAVE_FAILED');}
 finally{try{if(handle)await handle.close();}finally{if(temporaryOwned)await io.unlink(temporary).catch(()=>{});}}
}
export async function savePacket(packet,initial=false){await mkdir(packetDirectory,{recursive:true});const encrypted=await protect(JSON.stringify(packet));await writeEncryptedPacketFile(packetPath,encrypted,{initial});}
export async function loadPacket(){return JSON.parse(await protect(await readFile(packetPath,'utf8'),true));}
