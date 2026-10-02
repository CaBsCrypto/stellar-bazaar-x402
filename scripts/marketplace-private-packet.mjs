import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

export const packetDirectory=join(tmpdir(),'bazaar-marketplace-acceptance-encrypted');
export const packetPath=join(packetDirectory,'workspace-v1.dpapi');
function protect(input,decrypt=false){
 if(process.platform!=='win32')throw Error('WINDOWS_DPAPI_REQUIRED');
 const script=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$taskInput=[Console]::In.ReadToEnd();$taskBytes=${decrypt?'[Convert]::FromBase64String($taskInput)':'[Text.Encoding]::UTF8.GetBytes($taskInput)'};$taskResult=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write(${decrypt?'[Text.Encoding]::UTF8.GetString($taskResult)':'[Convert]::ToBase64String($taskResult)'})`;
 return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let result='',failed=false;child.stdout.on('data',v=>{result+=v;if(result.length>1048576){failed=true;child.kill();}});child.stderr.on('data',()=>{failed=true;});child.on('error',()=>reject(Error('DPAPI_PROCESS_UNAVAILABLE')));child.on('close',code=>code||failed?reject(Error('DPAPI_FAILED')):resolve(result));child.stdin.end(input);});
}
export async function savePacket(packet,initial=false){await mkdir(packetDirectory,{recursive:true});const encrypted=await protect(JSON.stringify(packet));await writeFile(packetPath,encrypted,{flag:initial?'wx':'w',mode:0o600});}
export async function loadPacket(){return JSON.parse(await protect(await readFile(packetPath,'utf8'),true));}
