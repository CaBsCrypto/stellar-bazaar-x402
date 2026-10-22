// Response diagnostics return fixed codes only, never a tool body or message.
const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{2,95}$/.test(value)?value:undefined;
const status=value=>Number.isSafeInteger(value)&&value>=400&&value<=599?value:undefined;
async function packet(response){
 const reader=response.clone().body?.getReader();if(!reader)return undefined;
 const chunks=[];let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>131072){void reader.cancel().catch(()=>{});return undefined;}chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{return undefined;}finally{reader.releaseLock();}
}
export async function nativeResponseFailureDiagnostic(response,{tool}={}){
 const body=await packet(response),result=body?.result;
 const safeTool=typeof tool==='string'&&/^[a-z_\/]{1,64}$/.test(tool)?tool:undefined;
 if(response.status>=400){const nativeCode=code(body?.error?.code??body?.error);return {kind:'HTTP_ERROR',status:response.status,...(nativeCode?{code:nativeCode}:{}),...(safeTool?{tool:safeTool}:{})};}
 if(result?.isError===true){
  let inner=result.structuredContent;
  if(!inner){const item=Array.isArray(result.content)?result.content.find(item=>item?.type==='text'&&typeof item.text==='string'&&Buffer.byteLength(item.text)<=131072):undefined;try{inner=item?JSON.parse(item.text):undefined;}catch{}}
  const nativeCode=code(inner?.error?.code??inner?.code),httpStatus=status(inner?.httpStatus??inner?.http?.status);
  return {kind:'MCP_TOOL_ERROR',status:response.status,...(nativeCode?{code:nativeCode}:{}),...(httpStatus?{toolHttpStatus:httpStatus}:{}),...(safeTool?{tool:safeTool}:{})};
 }
 if(body?.error&&Number.isSafeInteger(body.error.code)&&body.error.code<0)return {kind:'JSON_RPC_ERROR',status:response.status,rpcCode:body.error.code,...(safeTool?{tool:safeTool}:{})};
 return undefined;
}
