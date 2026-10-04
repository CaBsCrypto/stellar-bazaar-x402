import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPrivateMcp,originOnly,toolBody} from './private-mcp-client.mjs';
import {createProtectedPreviewFetch,withProtectedPrivateMcp} from './protected-preview-client.mjs';

// Run on the developer's computer/server. No provider execution, polling or signing.
const [command,path,operationId]=process.argv.slice(2);
const hash=text=>createHash('sha256').update(text).digest('hex');
async function boundedFile(file,max){const raw=await readFile(file);if(raw.length>max)throw Error('FILE_TOO_LARGE');return raw.toString('utf8');}
async function run(){
 if(command==='prepare'){
  if(!path||!operationId||!/^[-a-f0-9]{36}$/i.test(operationId))throw Error('Use: prepare <new-intent.json> <operationId>');
  await writeFile(path,JSON.stringify({version:1,operationId,attemptId:randomUUID()},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Saved claim intent. Read the order before claiming it.');return;
 }
 if(command==='save-text'){
  const packet=JSON.parse(await boundedFile(path,16384));
  if(packet.text!==undefined)throw Error('DELIVERY_ALREADY_FROZEN');
  const text=await boundedFile(operationId,8000);if(!text.length||text.length>2000)throw Error('TEXT_LIMIT_2000');
  // Preserve the original attempt. Explicitly freeze delivery before transmitting.
  await writeFile(path+'.delivery.json',JSON.stringify({...packet,text,textHash:hash(text)},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Saved delivery intent. Send the .delivery.json packet explicitly.');return;
 }
 if(!['inspect','claim','deliver','fail','uncertain'].includes(command))throw Error('Commands: prepare, inspect, claim, save-text, deliver, fail, uncertain');
 const origin=originOnly(process.env.BAZAAR_ORIGIN??'');if(!origin.startsWith('https://'))throw Error('HTTPS_REQUIRED');
 const token=process.env.BAZAAR_AGENT_ACCESS;if(!/^[a-zA-Z0-9_-]{43}$/.test(token??''))throw Error('AGENT_ACCESS_REQUIRED');
 let tool='list_market_orders',args={};
 if(command!=='inspect'){
  const p=JSON.parse(await boundedFile(path,16384));if(p.version!==1||!/^[-a-f0-9]{36}$/i.test(p.operationId??'')||!/^[-a-f0-9]{36}$/i.test(p.attemptId??''))throw Error('INVALID_INTENT');
  args={operationId:p.operationId,attemptId:p.attemptId};tool=command+'_market_order';
  if(command==='deliver'){if(typeof p.text!=='string'||!p.text.length||p.text.length>2000||p.textHash!==hash(p.text))throw Error('DELIVERY_CHANGED');args.text=p.text;}
  if(command==='fail'||command==='uncertain'){if(!operationId||operationId.length>500)throw Error('FAILURE_REASON_REQUIRED');args.reason=operationId;}
 }
 const action=client=>client.callTool({name:tool,arguments:args},undefined,{timeout:10000});
 const protectedPreview=process.env.BAZAAR_VERCEL_CLI||process.env.BAZAAR_VERCEL_AUTH_FILE;
 const response=protectedPreview?await withProtectedPrivateMcp(origin,token,await createProtectedPreviewFetch({origin,cliPath:process.env.BAZAAR_VERCEL_CLI,authFile:process.env.BAZAAR_VERCEL_AUTH_FILE}),action):await withPrivateMcp(origin,token,action);
 if(response.isError){const body=toolBody(response);throw Error(body.error?.code??'ACTION_UNCONFIRMED');}
 // This is private participant data; do not paste the output into public reports.
 console.log(JSON.stringify(toolBody(response),null,2));
}
run().catch(()=>{console.error('Action not confirmed. Preserve the packet and inspect the existing order; do not run the provider or submit another payment automatically.');process.exitCode=1;});
