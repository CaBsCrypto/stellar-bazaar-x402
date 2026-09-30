import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {preparePrivateDirectory,verifyPrivateDirectory} from '../scripts/history-private-files.mjs';
import {withPrivateMcp,originOnly,toolBody} from './private-mcp-client.mjs';

// Node 22.18+, repository dependencies. Never loads env, signs or sends payment.
// prepare PRIVATE_DIRECTORY ORIGIN; create|tasks|recover PRIVATE_DIRECTORY
// claim PRIVATE_DIRECTORY TASK_UUID; respond PRIVATE_DIRECTORY TASK_UUID RESPONSE_JSON
// record|activity PRIVATE_DIRECTORY JSON_FILE; rotate PRIVATE_DIRECTORY human|agent; revoke PRIVATE_DIRECTORY
const [mode,directory,arg,file]=process.argv.slice(2);
const modes=['prepare','create','tasks','claim','respond','record','activity','recover','rotate','revoke'];
if(!directory||!modes.includes(mode))throw Error('See /WORKSPACE_AGENT.md for commands.');
const dir=resolve(directory),rootFile=resolve(dir,'workspace-root.json'),agentFile=resolve(dir,'agent.json');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=text=>createHash('sha256').update(text).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')}}`:JSON.stringify(value);
function save(path,value){const tmp=path+'.'+randomUUID()+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});renameSync(tmp,path);}
function newSecret(role){return `bz_${role}_`+randomBytes(32).toString('hex');}
function snapshot(kind,body){const folder=resolve(dir,'responses');if(!existsSync(folder))mkdirSync(folder,{mode:0o700});writeFileSync(resolve(folder,`${Date.now()}-${kind}-${randomUUID()}.json`),JSON.stringify(body,null,2),{mode:0o600,flag:'wx'});}
function humanLinks(packet){writeFileSync(resolve(dir,'human-links.txt'),`${packet.origin}/agent-chat#token=${packet.humanAccess}\n${packet.origin}/history#token=${packet.humanAccess}\n`,{mode:0o600});}
async function call(origin,token,name,args={}){
  return withPrivateMcp(origin,token,async client=>{
    if(!(await client.listTools()).tools.some(tool=>tool.name===name))throw Error('Required tool unavailable');
    const response=await client.callTool({name,arguments:args}),body=toolBody(response);snapshot(name,body);
    if(response.isError){console.log(JSON.stringify({ok:false,code:body.error?.code??body.code??'REQUEST_FAILED',retryAfter:body.http?.retryAfter}));return null;}
    return body;
  });
}
if(mode==='prepare'){
  const origin=originOnly(arg);preparePrivateDirectory(dir);verifyPrivateDirectory(dir);
  const packet={version:1,origin,creationId:randomUUID(),bootstrapAccess:newSecret('bootstrap'),humanAccess:newSecret('human'),agentAccess:newSecret('agent'),state:'prepared'};
  packet.creationInput={creationId:packet.creationId,humanAccessHash:hash(packet.humanAccess),agentAccessHash:hash(packet.agentAccess)};
  packet.creationDigest=hash(canonical({origin:packet.origin,input:packet.creationInput}));
  writeFileSync(rootFile,JSON.stringify(packet,null,2),{mode:0o600,flag:'wx'});
  writeFileSync(agentFile,JSON.stringify({version:1,origin,agentAccess:packet.agentAccess},null,2),{mode:0o600,flag:'wx'});
  humanLinks(packet);
  console.log(JSON.stringify({prepared:true,secretPrinted:false,next:'create; protect workspace-root.json and human-links.txt. Give only agent.json to the agent.'}));
}else{
  verifyPrivateDirectory(dir);
  try{
    if(mode==='create'){
      const packet=JSON.parse(readFileSync(rootFile,'utf8'));originOnly(packet.origin);
      if(packet.version!==1||!uuid.test(packet.creationId)||hash(canonical({origin:packet.origin,input:packet.creationInput}))!==packet.creationDigest)throw Error('Frozen creation invalid');
      packet.state='creation-started';save(rootFile,packet);
      const body=await call(packet.origin,packet.bootstrapAccess,'create_bazaar_workspace',packet.creationInput);
      if(!body){process.exitCode=1;}else{
        const workspace=body.workspace??body.record;if(!workspace)throw Error('Creation response unavailable');
        if(!existsSync(resolve(dir,'creation-receipt.json')))writeFileSync(resolve(dir,'creation-receipt.json'),JSON.stringify(body,null,2),{mode:0o600,flag:'wx'});
        packet.workspace=workspace;packet.state=workspace.revoked?'revoked':'created';save(rootFile,packet);
        if(workspace.revoked){console.log(JSON.stringify({ok:false,code:'WORKSPACE_REVOKED',recreated:false}));process.exitCode=1;process.exit();}
        const agent=JSON.parse(readFileSync(agentFile,'utf8'));save(agentFile,{...agent,workspace});
        console.log(JSON.stringify({ok:true,workspaceId:workspace.workspaceId??workspace.id??workspace.ownerId,next:'Open human-links.txt privately. Agent uses only agent.json.'}));
      }
    }else if(mode==='rotate'||mode==='revoke'){
      const packet=JSON.parse(readFileSync(rootFile,'utf8'));
      const workspaceId=packet.workspace?.workspaceId??packet.workspace?.id;
      if(!workspaceId)throw Error('Create the space first');
      const pending=resolve(dir,'pending-access-change.json');
      let change;
      if(existsSync(pending))change=JSON.parse(readFileSync(pending,'utf8'));
      else{
        if(mode==='rotate'&&!['human','agent'].includes(arg))throw Error('Choose human or agent');
        const secret=mode==='rotate'?newSecret(arg):undefined;
        change={mode,role:arg,secret,body:{action:mode,expectedGeneration:packet.workspace.generation,...(secret?{role:arg,accessHash:hash(secret)}:{})}};
        writeFileSync(pending,JSON.stringify(change,null,2),{mode:0o600,flag:'wx'});
      }
      if(change.mode!==mode||(mode==='rotate'&&change.role!==arg))throw Error('Recover the pending access change before starting another');
      const endpoint=new URL(`/api/workspaces/${encodeURIComponent(workspaceId)}/access`,originOnly(packet.origin));
      const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${packet.bootstrapAccess}`,'Content-Type':'application/json'},body:JSON.stringify(change.body)});
      const body=await response.json();snapshot('access',body);
      if(!response.ok){console.log(JSON.stringify({ok:false,code:body.error?.code??'ACCESS_CHANGE_UNCERTAIN',next:'Keep pending-access-change.json; inspect the same change, never reset it.'}));process.exitCode=1;}
      else{
        packet.workspace=body.workspace??body.record??packet.workspace;
        if(mode==='rotate'){packet[`${arg}Access`]=change.secret;if(arg==='agent'){const agent=JSON.parse(readFileSync(agentFile,'utf8'));save(agentFile,{...agent,agentAccess:change.secret,workspace:packet.workspace});}else humanLinks(packet);}
        packet.state=mode==='revoke'?'revoked':'created';save(rootFile,packet);
        // Archive the accepted change; never overwrite its receipt or silently replay it.
        renameSync(pending,resolve(dir,`accepted-access-change-${randomUUID()}.json`));
        console.log(JSON.stringify({ok:true,action:mode,secretPrinted:false,...(body.current&&body.current.generation!==packet.workspace.generation?{warning:'A later access change exists; recover current state before another change.'}:{})}));
      }
    }else{
      // This path reads only the delegated agent file, never the bootstrap/human packet.
      const agent=JSON.parse(readFileSync(agentFile,'utf8'));originOnly(agent.origin);
      let name,args={};
      if(mode==='tasks')name='list_bazaar_agent_tasks';
      else if(mode==='recover')name='get_operation_history';
      else if(mode==='record'||mode==='activity'){
        const content=JSON.parse(readFileSync(resolve(arg),'utf8'));
        name=mode==='record'?'record_bazaar_operation':'record_bazaar_activity';args=mode==='record'?{operation:content}:{event:content};
      }else{
        if(!uuid.test(arg??''))throw Error('Task UUID required');
        const folder=resolve(dir,'attempts');if(!existsSync(folder))mkdirSync(folder,{mode:0o700});
        const path=resolve(folder,`${arg}.json`);let attempt;
        if(existsSync(path))attempt=JSON.parse(readFileSync(path,'utf8'));
        else{if(mode!=='claim')throw Error('Claim the task before responding');attempt={taskId:arg,attemptId:randomUUID()};writeFileSync(path,JSON.stringify(attempt,null,2),{mode:0o600,flag:'wx'});}
        if(mode==='claim'){name='claim_bazaar_agent_task';args={taskId:arg,attemptId:attempt.attemptId};}
        else{
          const response=JSON.parse(readFileSync(resolve(file),'utf8'));
          const frozen={taskId:arg,attemptId:attempt.attemptId,messageId:attempt.response?.messageId??randomUUID(),text:response.text,...(response.operationId?{operationId:response.operationId}:{})};
          if(attempt.response&&canonical(attempt.response)!==canonical(frozen))throw Error('Response changed; recover the original attempt');
          attempt.response=frozen;save(path,attempt);name='respond_bazaar_agent_task';args=frozen;
        }
      }
      const body=await call(agent.origin,agent.agentAccess,name,args);
      if(!body)process.exitCode=1;else console.log(JSON.stringify({ok:true,tool:name,count:body.tasks?.length??body.records?.length,next:'Response conserved in the private responses directory.'}));
    }
  }catch{console.error('Stopped. Keep the original private packet and attempt; do not create replacement credentials or repeat external effects.');process.exitCode=1;}
}
