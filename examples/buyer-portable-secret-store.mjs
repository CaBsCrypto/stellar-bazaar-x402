import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID,scrypt as derive} from 'node:crypto';
import {open,readFile,mkdir,lstat,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {promisify} from 'node:util';

const scrypt=promisify(derive),format='bazaar-portable-store',version=1;
const namePattern=/^[a-z0-9][a-z0-9._-]{0,80}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const parameters={N:32768,r:8,p:1,maxmem:64*1024*1024};
const maxBytes=4*1024*1024;
function encoded(bytes){return Buffer.from(bytes).toString('base64url');}
function decoded(text,size){if(typeof text!=='string'||!/^[A-Za-z0-9_-]+$/.test(text))throw Error('STORE_CORRUPT');const bytes=Buffer.from(text,'base64url');if(encoded(bytes)!==text||size!==undefined&&bytes.length!==size)throw Error('STORE_CORRUPT');return bytes;}
function validName(name){if(typeof name!=='string'||!namePattern.test(name))throw Error('INVALID_STORE_NAME');return name;}
async function safeFile(path){try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||process.platform!=='win32'&&(info.mode&0o077)!==0)throw Error('UNSAFE_STORE_FILE');}catch(error){if(error.code!=='ENOENT')throw error;}}
async function durableCreate(path,bytes){await safeFile(path);const file=await open(path,'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}}
async function directorySync(directory){let file;try{file=await open(directory,'r');await file.sync();}catch(error){if(!['EINVAL','EPERM','EACCES','ENOTSUP','EISDIR'].includes(error.code))throw error;}finally{await file?.close();}}

/** Portable encrypted state. Keep the password in private process memory only.
 * A lock left by a crashed process is deliberately retained for owner inspection.
 * Encrypted file backups must be protected from rollback by the owner as well.
 */
export async function openPortableSecretStore({directory,password,create=false}){
 if(typeof directory!=='string'||!directory||!(password instanceof Uint8Array)||password.length<12||password.length>4096)throw Error('STORE_PASSWORD_REQUIRED');
 const root=resolve(directory),metaPath=join(root,'store.json');
 if(create)await mkdir(root,{mode:0o700});
 const info=await lstat(root);if(!info.isDirectory()||info.isSymbolicLink()||process.platform!=='win32'&&((info.mode&0o077)!==0||info.uid!==process.getuid()))throw Error('UNSAFE_STORE_DIRECTORY');
 let metadata;
 if(create){metadata={format,version,kdf:'scrypt',salt:encoded(randomBytes(32)),N:parameters.N,r:parameters.r,p:parameters.p};await durableCreate(metaPath,JSON.stringify(metadata)+'\n');await directorySync(root);}
 else{await safeFile(metaPath);const raw=await readFile(metaPath);if(raw.length>1024)throw Error('STORE_CORRUPT');try{metadata=JSON.parse(raw);}catch{throw Error('STORE_CORRUPT');}}
 if(metadata.format!==format||metadata.version!==version||metadata.kdf!=='scrypt'||metadata.N!==parameters.N||metadata.r!==parameters.r||metadata.p!==parameters.p)throw Error('STORE_VERSION_UNSUPPORTED');
 const secret=Buffer.from(password),salt=decoded(metadata.salt,32);let key;
 try{key=await scrypt(secret,salt,32,parameters);}finally{secret.fill(0);}
 let disposed=false;const ensure=()=>{if(disposed)throw Error('STORE_CLOSED');};
 const aad=purpose=>Buffer.from(JSON.stringify({format,version,salt:metadata.salt,purpose}));
 function seal(value,purpose){ensure();const plaintext=Buffer.from(JSON.stringify(value));if(plaintext.length>maxBytes)throw Error('STORE_VALUE_TOO_LARGE');try{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad(purpose));const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);return {version,nonce:encoded(nonce),tag:encoded(cipher.getAuthTag()),ciphertext:encoded(ciphertext)};}finally{plaintext.fill(0);}}
 function unseal(envelope,purpose){ensure();if(envelope?.version!==version)throw Error('STORE_VERSION_UNSUPPORTED');let plaintext;try{const decipher=createDecipheriv('aes-256-gcm',key,decoded(envelope.nonce,12));decipher.setAAD(aad(purpose));decipher.setAuthTag(decoded(envelope.tag,16));plaintext=Buffer.concat([decipher.update(decoded(envelope.ciphertext)),decipher.final()]);if(plaintext.length>maxBytes)throw Error('STORE_VALUE_TOO_LARGE');return JSON.parse(plaintext);}catch{throw Error('STORE_AUTHENTICATION_FAILED');}finally{plaintext?.fill(0);}}
 async function state(name){ensure();const path=join(root,validName(name)+'.sealed');await safeFile(path);let raw;try{raw=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return undefined;throw error;}if(Buffer.byteLength(raw)>16*1024*1024)throw Error('STORE_VALUE_TOO_LARGE');if(!raw.endsWith('\n'))throw Error('STORE_UNCONFIRMED');const lines=raw.slice(0,-1).split('\n');let previous='0'.repeat(64),value,sequence=0;
  for(const line of lines){let envelope;try{envelope=JSON.parse(line);}catch{throw Error('STORE_CORRUPT');}const record=unseal(envelope,'state:'+name+':'+sequence);if(record.sequence!==sequence||record.previous!==previous||!Object.hasOwn(record,'value'))throw Error('STORE_CHAIN_CHANGED');previous=hash(line);value=record.value;sequence++;}return {value,sequence,previous};
 }
 async function read(name){return (await state(name))?.value;}
 async function write(name,value,{createOnly=false}={}){ensure();const path=join(root,validName(name)+'.sealed'),current=createOnly?undefined:await state(name),sequence=current?.sequence??0,previous=current?.previous??'0'.repeat(64);const bytes=JSON.stringify(seal({sequence,previous,value},'state:'+name+':'+sequence))+'\n';if(!current){await durableCreate(path,bytes);await directorySync(root);return;}await safeFile(path);const file=await open(path,'a',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}}
 async function acquireLock(name){ensure();const path=join(root,validName(name)+'.lock'),lockId=randomUUID();try{await durableCreate(path,JSON.stringify({version,lockId})+'\n');await directorySync(root);}catch(error){if(error.code==='EEXIST')throw Error('STORE_LOCKED_OWNER_INSPECTION_REQUIRED');throw error;}let released=false;return async()=>{if(released)return;await safeFile(path);const raw=await readFile(path);if(raw.length>1024)throw Error('STORE_LOCK_CHANGED');let held;try{held=JSON.parse(raw);}catch{throw Error('STORE_LOCK_CHANGED');}if(held.version!==version||held.lockId!==lockId)throw Error('STORE_LOCK_CHANGED');await unlink(path);await directorySync(root);released=true;};}
 function journal(name){validName(name);const path=join(root,name+'.journal');let lastHash,sequence;
  async function read(){ensure();await safeFile(path);const raw=await readFile(path,'utf8');if(Buffer.byteLength(raw)>16*1024*1024)throw Error('JOURNAL_TOO_LARGE');if(!raw.endsWith('\n'))throw Error('JOURNAL_UNCONFIRMED');const lines=raw.slice(0,-1).split('\n');if(!lines.length||lines.some(line=>!line))throw Error('JOURNAL_UNCONFIRMED');let previous='0'.repeat(64),value,index=0;
   for(const line of lines){let envelope;try{envelope=JSON.parse(line);}catch{throw Error('JOURNAL_UNCONFIRMED');}const record=unseal(envelope,'journal:'+name+':'+index);if(record.sequence!==index||record.previous!==previous||!Object.hasOwn(record,'value'))throw Error('JOURNAL_CHAIN_CHANGED');previous=hash(line);value=record.value;index++;}
   lastHash=previous;sequence=index;return value;
  }
  async function initialize(value){ensure();const line=JSON.stringify(seal({sequence:0,previous:'0'.repeat(64),value},'journal:'+name+':0'));await durableCreate(path,line+'\n');await directorySync(root);lastHash=hash(line);sequence=1;}
  async function append(value){ensure();await read();const line=JSON.stringify(seal({sequence,previous:lastHash,value},'journal:'+name+':'+sequence));await safeFile(path);const file=await open(path,'a',0o600);try{await file.writeFile(line+'\n');await file.sync();}finally{await file.close();}lastHash=hash(line);sequence++;}
  return {initialize,append,read};
 }
 const store={read,write,acquireLock,journal,dispose(){if(!disposed){key.fill(0);disposed=true;}}};
 try{if(create)await write('store-check',{format,version},{createOnly:true});else{const check=await read('store-check');if(check?.format!==format||check.version!==version)throw Error('STORE_AUTHENTICATION_FAILED');}return store;}catch(error){store.dispose();throw error;}
}
