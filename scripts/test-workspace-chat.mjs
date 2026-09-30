import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWorkspaceChatHandlers } from '../lib/workspace-chat-http.ts';
import { WorkspaceError } from '../lib/workspace-types.ts';
process.env.BAZAAR_ENABLE_OPEN_WORKSPACES='true';
process.env.BAZAAR_WORKSPACE_BACKEND='file';
process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN='http://localhost';
const conversationId=randomUUID(),taskId=randomUUID(),messageId=randomUUID(),attemptId=randomUUID();
let invoked=0, last;
const records=new Map();
const handlers=createWorkspaceChatHandlers({
 authenticate:async(request,role)=>{const actual=request.headers.get('authorization');if(!['human','agent','bootstrap'].includes(actual))throw new WorkspaceError('UNAUTHORIZED',401);if(role&&actual!==role)throw new WorkspaceError('FORBIDDEN',403);return {ownerId:'server-owner',workspaceId:'server-workspace',agentId:'server-agent',generation:1,role:actual};},
 store:()=>({forPrincipal:principal=>{
 assert.equal(principal.ownerId,'server-owner');
 const save=async(owner,body)=>{invoked++;assert.equal(owner,'server-owner');last=body;const key=body.messageId??body.taskId??body.conversationId,serialized=JSON.stringify(body);if(records.has(key)&&records.get(key)!==serialized)throw new WorkspaceError('CONFLICT',409);const created=!records.has(key);records.set(key,serialized);return{record:body,created};};
 return {listConversations:async()=>[],getConversation:async()=>null,createConversation:save,sendHumanMessage:save,listAgentTasks:async()=>[],claimTask:save,respondToTask:save};
 }})
});
const request=(role,body,path='/api/conversations')=>new Request('http://localhost'+path,{method:body?'POST':'GET',headers:{authorization:role,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
assert.equal((await handlers.conversationsPOST(request('human',{conversationId,title:'Synthetic'}))).status,201);
assert.equal((await handlers.conversationsPOST(request('human',{conversationId,title:'Synthetic'}))).status,200);
assert.equal((await handlers.conversationsPOST(request('human',{conversationId,title:'Changed'}))).status,409);
const before=invoked;
for(const extra of [{ownerId:'attacker'},{agentId:'attacker'},{actor:'agent'}])assert.equal((await handlers.messagesPOST(request('human',{messageId,taskId,text:'Hello',...extra}),conversationId)).status,400);
assert.equal((await handlers.messagesPOST(request('agent',{messageId,taskId,text:'Hello'}),conversationId)).status,403);
assert.equal((await handlers.tasksGET(request('human'))).status,403);
assert.equal((await handlers.conversationsGET(request('bootstrap'))).status,403);
assert.equal((await handlers.conversationsGET(request('unknown'))).status,401);
assert.equal(invoked,before);
assert.equal((await handlers.tasksPOST(request('agent',{taskId,attemptId}))).status,201);assert.equal(last.agentId,'server-agent');
const exactText='  Texto humano\ncon formato  ';
assert.equal((await handlers.messagesPOST(request('human',{messageId,taskId,text:exactText}),conversationId)).status,201);
assert.equal(last.text,exactText);
assert.equal((await handlers.messagesPOST(request('human',{messageId,taskId,text:exactText}),conversationId)).status,200);
assert.equal((await handlers.messagesPOST(request('human',{messageId,taskId,text:exactText.trim()}),conversationId)).status,409);
assert.equal((await handlers.messagesPOST(request('human',{messageId:randomUUID(),taskId:randomUUID(),text:' \n '}),conversationId)).status,400);
assert.equal((await handlers.messagesGET(request('human'),conversationId)).status,404);
assert.equal((await handlers.messagesPOST(request('human',{messageId,taskId,text:'x'.repeat(2001)}),conversationId)).status,400);
const origin=request('human',{conversationId,title:'X'});origin.headers.set('origin','https://attacker.invalid');assert.equal((await handlers.conversationsPOST(origin)).status,400);
assert.equal((await handlers.conversationsGET(request('human',undefined,'/api/conversations?ownerId=other'))).status,400);
const valid=await handlers.conversationsGET(request('human'));assert.match(valid.headers.get('cache-control'),/no-store/);
console.log('PASS chat handler strict bodies, roles, server identity, idempotency/conflict, origins, input limits, private headers. Synthetic injected store only.');

