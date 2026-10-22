import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod/v4';
import {BAZAAR_INTEGRATION_TOOL,BAZAAR_INTEGRATION_RESOURCE_URI,bazaarIntegrationContract} from './bazaar-integration-contract.ts';

export const integrationDescription='Read the authoritative public Bazaar integration contract: architecture, MCP and HTTP endpoints, Stellar x402 payment format, account setup, owner-scoped history, recovery rules and pilot admission requirements. Start here before connecting an agent. This static guide does not create an account, authorize a purchase, sign or pay.';
export const integrationAnnotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
export const integrationSecuritySchemes=[{type:'noauth'}];

export function registerBazaarIntegration(server:McpServer){
 server.registerTool(BAZAAR_INTEGRATION_TOOL,{description:integrationDescription,inputSchema:z.object({}).strict(),annotations:integrationAnnotations,_meta:{securitySchemes:integrationSecuritySchemes}},async()=>({content:[{type:'text' as const,text:JSON.stringify(bazaarIntegrationContract())}],isError:false}));
 server.registerResource('bazaar-integration',BAZAAR_INTEGRATION_RESOURCE_URI,{title:'Bazaar agent integration contract',description:integrationDescription,mimeType:'application/json'},async()=>({contents:[{uri:BAZAAR_INTEGRATION_RESOURCE_URI,mimeType:'application/json',text:JSON.stringify(bazaarIntegrationContract())}]}));
}

/** Only static documentation may bypass database ingress. SDK validation still
 * checks JSON-RPC, tool arguments and resource parameters before answering. */
export function isBazaarIntegrationRequest(rpc:unknown){
 if(!rpc||typeof rpc!=='object'||Array.isArray(rpc))return false;
 const r=rpc as {jsonrpc?:unknown;method?:unknown;params?:{name?:unknown;uri?:unknown}};
 if(r.jsonrpc!=='2.0')return false;
 return r.method==='tools/call'&&r.params?.name===BAZAAR_INTEGRATION_TOOL||r.method==='resources/list'||r.method==='resources/read'&&r.params?.uri===BAZAAR_INTEGRATION_RESOURCE_URI;
}
