import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { withPrivateMcp, originOnly, toolBody } from './private-mcp-client.mjs';
import { preparePrivateDirectory, verifyPrivateDirectory } from '../scripts/history-private-files.mjs';

// Run from this repository with npm ci and Node 22.18+. Never loads an env file.
// prepare PRIVATE_DIRECTORY ORIGIN CARD_JSON dns-txt|http-well-known EXACT_DOMAIN
// submit|retry|status PRIVATE_DIRECTORY. retry is an explicit replay of the frozen intent.
const [mode, directory, origin, cardFile, method, domain] = process.argv.slice(2);
if (!directory || !['prepare','submit','retry','status'].includes(mode)) throw Error('Usage: prepare PRIVATE_DIRECTORY ORIGIN CARD_JSON METHOD DOMAIN; submit|retry|status PRIVATE_DIRECTORY');
const dir = resolve(directory), path = resolve(dir, 'request.json');
const validateOrigin = originOnly;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value==='object' ? `{${Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')}}` : JSON.stringify(value);
const digest = packet => createHash('sha256').update(canonical({origin:packet.origin,submissionId:packet.submissionId,card:packet.card,controlProof:packet.controlProof})).digest('hex');
function save(packet) { const temp=resolve(dir,`request.${randomUUID()}.tmp`); writeFileSync(temp,JSON.stringify(packet,null,2),{flag:'wx',mode:0o600}); renameSync(temp,path); }
if (mode === 'prepare') {
  if (!cardFile || !['dns-txt','http-well-known'].includes(method) || !domain) throw Error('Card and control proof required');
  const endpoint = validateOrigin(origin);
  const card = JSON.parse(readFileSync(resolve(cardFile),'utf8'));
  preparePrivateDirectory(dir); verifyPrivateDirectory(dir);
  const packet={version:1,origin:endpoint,submissionId:randomUUID(),submissionToken:randomBytes(32).toString('hex'),card,controlProof:{method,domain},state:'prepared'};
  packet.conditionsDigest=digest(packet);
  writeFileSync(path,JSON.stringify(packet,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({prepared:true,secretPrinted:false,next:'Validate conditions and authorize before submit.'}));
} else {
  verifyPrivateDirectory(dir);
  const packet=JSON.parse(readFileSync(path,'utf8'));
  validateOrigin(packet.origin);
  if(packet.version!==1||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packet.submissionId)||!/^[a-f0-9]{64}$/.test(packet.submissionToken))throw Error('Private packet invalid');
  if(!packet.conditionsDigest || digest(packet)!==packet.conditionsDigest)throw Error('Frozen conditions changed; preserve the original packet.');
  if(mode==='submit'&&packet.state!=='prepared')throw Error('Attempt already started. Use status; do not create another request.');
  try {
    await withPrivateMcp(packet.origin,packet.submissionToken,async client=>{
    const {tools}=await client.listTools();
    const sending=mode==='submit'||mode==='retry';
    const name=sending?'submit_provider_request':'get_provider_request_status';
    if(!tools.some(t=>t.name===name))throw Error('Required tool unavailable');
    if(sending){
      const validation=await client.callTool({name:'validate_service_card',arguments:{card:packet.card}});
      const validated=toolBody(validation);
      if(validation.isError||validated.valid!==true)throw Error('Card validation failed');
      packet.state='submit-started';save(packet);
    }
    const response=await client.callTool({name,arguments:sending?{submissionId:packet.submissionId,card:packet.card,controlProof:packet.controlProof}:{submissionId:packet.submissionId}});
    const body=toolBody(response);
    // Preserve response before reporting. No automatic retry or replacement intent.
    const snapshots=resolve(dir,'responses');if(!existsSync(snapshots))mkdirSync(snapshots,{mode:0o700});
    writeFileSync(resolve(snapshots,`${Date.now()}-${randomUUID()}.json`),JSON.stringify(body,null,2),{flag:'wx',mode:0o600});
    if(!response.isError&&body.ok===true&&!existsSync(resolve(dir,'accepted-receipt.json')))writeFileSync(resolve(dir,'accepted-receipt.json'),JSON.stringify(body,null,2),{flag:'wx',mode:0o600});
    if(response.isError||body.ok!==true){console.log(JSON.stringify({ok:false,code:body.error?.code??'REQUEST_FAILED',retryAfter:body.http?.retryAfter,next:'Use status; an explicit retry replays only this frozen request.'}));process.exitCode=1;}
    else { packet.state='response-saved';save(packet);console.log(JSON.stringify({ok:true,submissionId:packet.submissionId,status:body.submission.status,publiclyActive:body.submission.publiclyActive})); }
    });
  } catch { console.error('Stopped. Preserve private request.json; use status for the same intent.'); process.exitCode=1; }
}
