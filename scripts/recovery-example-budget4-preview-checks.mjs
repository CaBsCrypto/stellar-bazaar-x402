import QRCode from 'qrcode';
import {validateV4PreviewRequest} from './recovery-example-budget4-preview-contract.mjs';
const fail=code=>{throw Error(code);};
export function v4RpcResult(value){let b;try{b=JSON.parse(value);}catch{const line=value.split('\n').filter(s=>s.startsWith('data: ')).at(-1);if(!line)fail('V4_MCP_JSON_OR_EVENT_REQUIRED');b=JSON.parse(line.slice(6));}if(b.error)fail('V4_MCP_ERROR');return b.result;}
export function v4ToolBody(result){if(result.isError)fail('V4_TOOL_ERROR');const b=result.structuredContent??JSON.parse(result.content?.find(x=>x.type==='text')?.text??'null');if(!b||b.ok===false||b.httpStatus>=400)fail('V4_NATIVE_TOOL_FAILED');return b;}
/** The live controller supplies a fixed-alias, bounded, authenticated sender.
 * This injection is internal to pure tests; no request or CLI selects it. */
export async function runV4PreviewChecks(j,send,progress=()=>{},expected){
 let checks=0,id=0;const base='https://stellar-bazaar-x402-example-budget2.vercel.app';
 const call=async(path,init={})=>{validateV4PreviewRequest(j,base+path,init,expected);return send(path,init);};
 const headers={authorization:'Bearer '+j.buyer.agent,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'};
 async function rpc(method,params){const res=await call('/api/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(method.startsWith('notifications/')?{}:{id:++id}),method,...(params?{params}:{})})});if(method.startsWith('notifications/')){if(![202,204].includes(res.status))fail('V4_NOTIFICATION_FAILED');return;}if(res.status!==200)fail('V4_MCP_HTTP_FAILED');return v4RpcResult(res.text);}
 const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'bazaar-v4-existing-order-acceptance',version:'1.0.0'}});if(!init.protocolVersion)fail('V4_INITIALIZE_FAILED');checks++;await rpc('notifications/initialized');checks++;
 const listed=await rpc('tools/list');for(const name of ['get_bazaar_identity','get_market_order','get_bazaar_skills','list_market_services'])if(!listed.tools?.some(x=>x.name===name))fail('V4_TOOL_LIST_CHANGED');checks+=4;progress({stage:'mcp-read-only',checks});
 for(const [name,args]of [['get_bazaar_identity',{}],['get_bazaar_capabilities',{}],['get_service',{id:j.card.id}],['get_bazaar_skills',{}],['list_market_services',{}],['get_market_order',{operationId:j.operationId}],['list_market_orders',{}],['get_bazaar_query_history',{}]]){const b=v4ToolBody(await rpc('tools/call',{name,arguments:args}));if(name==='get_market_order')assertUnpaid(b.order,j);if(name==='get_bazaar_identity')assertIdentity(b,j);if(name==='get_bazaar_query_history'&&!Array.isArray(b.queries))fail('V4_PRIVATE_HISTORY_SHAPE_FAILED');checks++;}
 progress({stage:'private-http-account-exports',checks});
 for(const key of ['human','agent'])for(const path of ['/api/account/identity','/api/account/queries','/api/market/orders/'+j.operationId]){const value=await call(path,{headers:{authorization:'Bearer '+j.buyer[key]}});if(value.status!==200)fail('V4_PRIVATE_READ_FAILED');const b=JSON.parse(value.text);if(b.ok===false)fail('V4_PRIVATE_BODY_FAILED');if(path.startsWith('/api/market/orders/'))assertUnpaid(b.order,j);if(path==='/api/account/identity')assertIdentity(b,j);if(path==='/api/account/queries'&&!Array.isArray(b.queries))fail('V4_PRIVATE_HISTORY_SHAPE_FAILED');checks++;}
 const sale=await call('/api/market/orders/'+j.operationId,{headers:{authorization:'Bearer '+j.seller.human}});if(sale.status===200){const o=JSON.parse(sale.text).order;if(o?.sellerOwnerId!==j.seller.receipt.ownerId)fail('V4_SELLER_SALE_SCOPE_CHANGED');assertUnpaid(o,j);}else if(![403,404].includes(sale.status))fail('V4_SELLER_READ_FAILED');checks++;
 progress({stage:'public-catalog-qr',checks});
 const catalog=await call('/api/market/catalog?q=Comprobante&limit=20');if(catalog.status!==200)fail('V4_CATALOG_FAILED');checks++;
 const svg=await call('/resources/'+j.card.id+'/qr.svg'),url=base+'/resources/'+j.card.id,expectedSvg=await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',margin:4,width:320});if(svg.status!==200||svg.text!==expectedSvg||svg.text.includes('Bearer'))fail('V4_EXACT_PREVIEW_QR_DESTINATION_FAILED');checks++;
 progress({stage:'completed',checks});return {checks,qrDestination:url,qrExactLockedEncoderMatch:true};
}
function assertUnpaid(o,j){if(o?.phase!=='awaiting-payment'||o.operationId!==j.operationId||o.cardHash!==j.cardHash||o.buyerOwnerId!==j.buyer.receipt.ownerId||o.sellerOwnerId!==j.seller.receipt.ownerId||o.serviceId!==j.card.id||o.amount!=='0.01'||o.budgetProfile?.version!=='example-text-wire/v2'||o.transactionHash||o.paymentVerifiedAt||o.delivery)fail('V4_ORIGINAL_UNPAID_ORDER_CHANGED');}
function assertIdentity(b,j){if(b.ownerId!==j.buyer.receipt.ownerId||b.network!=='stellar:testnet')fail('V4_BUYER_IDENTITY_SCOPE_CHANGED');}
