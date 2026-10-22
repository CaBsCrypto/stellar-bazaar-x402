import assert from 'node:assert/strict';
import {nativeResponseFailureDiagnostic as diagnostic} from './recovery-example-native-response-diagnostic.mjs';
let checks=0;const secret='NEVER-PRINT-PRIVATE-MESSAGE';
for(const inner of [{httpStatus:503,error:{code:'CAPACITY_BINDING_CHANGED',message:secret}},{http:{status:429},code:'FREE_DEMO_REQUEST_LIMIT',token:secret}]){
 const result={isError:true,content:[{type:'text',text:JSON.stringify(inner)}]},response=Response.json({jsonrpc:'2.0',id:1,result});const value=await diagnostic(response,{tool:'claim_market_order'});
 assert.equal(value.kind,'MCP_TOOL_ERROR');assert.ok(value.code);assert.ok(value.toolHttpStatus>=400);assert.equal(JSON.stringify(value).includes(secret),false);assert.equal(response.bodyUsed,false);checks+=5;
}
assert.deepEqual(await diagnostic(Response.json({result:{isError:true,structuredContent:{httpStatus:503,error:{code:'WORKSPACE_UNAVAILABLE',message:secret}},content:[]}})),{kind:'MCP_TOOL_ERROR',status:200,code:'WORKSPACE_UNAVAILABLE',toolHttpStatus:503});checks++;
assert.deepEqual(await diagnostic(Response.json({error:{code:'UNAUTHORIZED',message:secret}},{status:401})),{kind:'HTTP_ERROR',status:401,code:'UNAUTHORIZED'});checks++;
assert.deepEqual(await diagnostic(Response.json({jsonrpc:'2.0',error:{code:-32603,message:secret}})),{kind:'JSON_RPC_ERROR',status:200,rpcCode:-32603});checks++;
assert.equal(await diagnostic(Response.json({result:{content:[{type:'text',text:JSON.stringify({order:{token:secret}})}]}})),undefined);checks++;
const oversized=await diagnostic(new Response('x'.repeat(131073),{status:503}));assert.deepEqual(oversized,{kind:'HTTP_ERROR',status:503});checks++;
assert.deepEqual(await diagnostic(Response.json({result:{isError:true,content:[{type:'text',text:'invalid '+secret}]}}),{tool:secret+'?'}),{kind:'MCP_TOOL_ERROR',status:200});checks++;
console.log(JSON.stringify({status:'PASS_NATIVE_RESPONSE_FAILURE_DIAGNOSTIC',checks,networkRequests:0,redisCommands:0,secretValuesReturned:0}));
