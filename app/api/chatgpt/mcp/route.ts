import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createChatGptPublicMcpServer,CHATGPT_PUBLIC_TOOLS} from '../../../../lib/chatgpt-public-mcp';
import {publicCatalogueSnapshot} from '../../../../lib/public-catalogue-snapshot.ts';
import {workspacePublicOrigin} from '../../../../lib/workspace-public-origin.ts';
import {MCP_VERSION} from '../../../../lib/mcp-tool-contract';
import {BAZAAR_INTEGRATION_RESOURCE_URI} from '../../../../lib/bazaar-integration-contract.ts';
import {marketOrderStorageMetadata} from '../../../../lib/per-order-storage-profile.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const PATH='/api/chatgpt/mcp',maximumRequestBytes=64*1024,maximumResponseBytes=512*1024;
const headers={'Cache-Control':'private, no-store','Vary':'Origin, Accept','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const toolNames=new Set<string>(CHATGPT_PUBLIC_TOOLS);
const methods=new Set(['initialize','notifications/initialized','tools/list','tools/call','resources/list','resources/read']);
function denied(status:number,code:number,message:string,id:string|number|null=null){return Response.json({jsonrpc:'2.0',id,error:{code,message}},{status,headers});}
function boundary(request:Request){
 if(request.headers.has('authorization'))return denied(400,-32600,'This public connection does not accept credentials.');
 if(Buffer.byteLength(JSON.stringify([...request.headers]))>32*1024)return denied(431,-32600,'Public request headers are oversized.');
 try{const url=new URL(request.url),configured=workspacePublicOrigin()??'https://bazaar.browns.studio',expected=new URL(configured),origin=request.headers.get('origin');
  if(expected.origin!==configured||expected.username||expected.password||expected.search||expected.hash||(expected.protocol!=='https:'&&!(expected.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(expected.hostname)))||url.origin!==expected.origin||url.pathname!==PATH||url.search||url.hash||url.username||url.password||origin!==null&&origin!==expected.origin)return denied(400,-32600,'Public request origin or path is invalid.');
 }catch{return denied(400,-32600,'Public request origin is unavailable.');}
 return undefined;
}
async function readRpc(request:Request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('INVALID_PUBLIC_JSON');
 const reader=request.body?.getReader();if(!reader)throw Error('INVALID_PUBLIC_JSON');const parts:Uint8Array[]=[];let size=0;
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>maximumRequestBytes){void reader.cancel().catch(()=>{});throw Error('PUBLIC_REQUEST_BOUND');}parts.push(p.value);}
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
 }finally{reader.releaseLock();parts.forEach(p=>p.fill(0));}
}
async function handleProtocolPost(request:Request){
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true}),server=createChatGptPublicMcpServer(request);
 await server.connect(transport);const response=await transport.handleRequest(request),reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;
 if(reader)try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>maximumResponseBytes){void reader.cancel().catch(()=>{});return denied(503,-32603,'Public response exceeds its bounded allocation.');}parts.push(p.value);}}finally{reader.releaseLock();}
 const out=new Headers(response.headers);for(const[name,value]of Object.entries(headers))out.set(name,value);
 for(const name of ['Requests','Commands-Upper-Bound','Outbound-Payload-Bytes','Inbound-Payload-Bytes'])out.set('X-Bazaar-Redis-'+name,'0');out.set('X-Bazaar-Redis-Uncertain','false');
 out.set('X-Bazaar-Public-Catalogue-Revision',publicCatalogueSnapshot.metadata().revision);
 return new Response(size?Buffer.concat(parts):null,{status:response.status,headers:out});
}
export async function POST(request:Request){
 const failure=boundary(request);if(failure)return failure;
 let rpc:unknown;try{rpc=await readRpc(request);}catch(error){return denied(error instanceof Error&&error.message==='PUBLIC_REQUEST_BOUND'?413:400,-32600,'Invalid or oversized public MCP request.');}
 if(!rpc||typeof rpc!=='object'||Array.isArray(rpc))return denied(400,-32600,'One JSON-RPC request is required.');
 const r=rpc as{jsonrpc?:unknown;method?:unknown;id?:unknown;params?:{name?:unknown;uri?:unknown}};
 const id=typeof r.id==='string'||typeof r.id==='number'&&Number.isSafeInteger(r.id)?r.id:null;
 if(r.jsonrpc!=='2.0'||typeof r.method!=='string'||!methods.has(r.method))return denied(400,-32601,'Public discovery method unavailable.',id);
 if(r.method==='tools/call'&&(typeof r.params?.name!=='string'||!toolNames.has(r.params.name)))return denied(404,-32601,'Only public integration and catalogue tools are available.',id);
 if(r.method==='resources/read'&&r.params?.uri!==BAZAAR_INTEGRATION_RESOURCE_URI)return denied(404,-32602,'Public integration resource unavailable.',id);
 // Every approved callback is a pure publication read. No public request is
 // forwarded to native account, catalogue, quota or financial handlers.
 const json=JSON.stringify(rpc);if(Buffer.byteLength(json)>maximumRequestBytes)return denied(413,-32600,'Invalid or oversized public MCP request.');
 const requestHeaders=new Headers(request.headers);requestHeaders.set('content-length',String(Buffer.byteLength(json)));
 try{return await handleProtocolPost(new Request(request.url,{method:'POST',headers:requestHeaders,body:json,signal:request.signal}));}catch{return denied(503,-32603,'Public discovery response was not confirmed.');}
}
export function GET(request:Request){
 const failure=boundary(request);if(failure)return failure;
 if((request.headers.get('accept')??'').toLowerCase().includes('text/event-stream'))return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
 return Response.json({name:'bazaar-public-catalogue',version:MCP_VERSION,transport:'streamable-http',endpoint:PATH,tools:CHATGPT_PUBLIC_TOOLS,resources:[BAZAAR_INTEGRATION_RESOURCE_URI],integration:'/api/integration',guide:'/INTEGRATION.md',authentication:'none',catalogueSnapshot:publicCatalogueSnapshot.metadata(),marketOrderStorage:marketOrderStorageMetadata(),privateHistory:false,accountCreation:false,orders:false,payments:false,signing:false},{headers});
}
export function DELETE(){return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});}
