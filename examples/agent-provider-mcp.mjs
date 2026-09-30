import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { preparePrivateDirectory, verifyPrivateDirectory } from '../scripts/history-private-files.mjs';

// Run from this repository with npm ci and Node 22.18+. Never loads an env file.
// prepare PRIVATE_DIRECTORY ORIGIN CARD_JSON dns-txt|http-well-known EXACT_DOMAIN
// submit|status PRIVATE_DIRECTORY
const [mode, directory, origin, cardFile, method, domain] = process.argv.slice(2);
if (!directory || !['prepare','submit','status'].includes(mode)) throw Error('Usage: prepare PRIVATE_DIRECTORY ORIGIN CARD_JSON METHOD DOMAIN; submit|status PRIVATE_DIRECTORY');
const dir = resolve(directory), path = resolve(dir, 'request.json');
function validateOrigin(raw) {
  const url = new URL(raw);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Invalid origin');
  return url.origin;
}
function save(packet) { const temp=resolve(dir,`request.${randomUUID()}.tmp`); writeFileSync(temp,JSON.stringify(packet,null,2),{flag:'wx',mode:0o600}); renameSync(temp,path); }
if (mode === 'prepare') {
  if (!cardFile || !['dns-txt','http-well-known'].includes(method) || !domain) throw Error('Card and control proof required');
  const endpoint = validateOrigin(origin);
  const card = JSON.parse(readFileSync(resolve(cardFile),'utf8'));
  preparePrivateDirectory(dir); verifyPrivateDirectory(dir);
  writeFileSync(path,JSON.stringify({version:1,origin:endpoint,submissionId:randomUUID(),submissionToken:randomBytes(32).toString('hex'),card,controlProof:{method,domain},state:'prepared'},null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({prepared:true,secretPrinted:false,next:'Validate conditions and authorize before submit.'}));
} else {
  verifyPrivateDirectory(dir);
  const packet=JSON.parse(readFileSync(path,'utf8'));
  validateOrigin(packet.origin);
  if(packet.version!==1||!/^\w{8}-[\w-]{27}$/.test(packet.submissionId)||!/^[a-f0-9]{64}$/.test(packet.submissionToken))throw Error('Private packet invalid');
  if(mode==='submit'&&packet.state!=='prepared')throw Error('Attempt already started. Use status; do not create another request.');
  const client=new Client({name:'bazaar-provider-example',version:'1'});
  const endpoint=new URL('/api/mcp',packet.origin);
  const transport=new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{Authorization:`Bearer ${packet.submissionToken}`}},fetch:async(url,init)=>{
    if(new URL(url instanceof Request?url.url:String(url)).origin!==endpoint.origin)throw Error('Cross-origin request denied');
    return fetch(url,{...init,redirect:'error'});
  }});
  try {
    await client.connect(transport);
    const {tools}=await client.listTools();
    const name=mode==='submit'?'submit_provider_request':'get_provider_request_status';
    if(!tools.some(t=>t.name===name))throw Error('Required tool unavailable');
    if(mode==='submit'){
      const validation=await client.callTool({name:'validate_service_card',arguments:{card:packet.card}});
      const validated=validation.structuredContent??JSON.parse(validation.content[0].text);
      if(validation.isError||validated.valid!==true)throw Error('Card validation failed');
      packet.state='submit-started';save(packet);
    }
    const response=await client.callTool({name,arguments:mode==='submit'?{submissionId:packet.submissionId,card:packet.card,controlProof:packet.controlProof}:{submissionId:packet.submissionId}});
    const body=response.structuredContent??JSON.parse(response.content[0].text);
    // Preserve response before reporting. No automatic retry or replacement intent.
    writeFileSync(resolve(dir,'response.json'),JSON.stringify(body,null,2),{mode:0o600});
    if(response.isError||body.ok!==true){console.log(JSON.stringify({ok:false,code:body.error?.code??'REQUEST_FAILED',next:'Recover the same request; no automatic retry.'}));process.exitCode=1;}
    else { packet.state='response-saved';save(packet);console.log(JSON.stringify({ok:true,submissionId:packet.submissionId,status:body.submission.status,publiclyActive:body.submission.publiclyActive})); }
  } catch { console.error('Stopped. Preserve private request.json; use status for the same intent.'); process.exitCode=1; }
  finally { await client.close().catch(()=>{}); }
}
