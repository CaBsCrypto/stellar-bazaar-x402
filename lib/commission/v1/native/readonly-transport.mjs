import {SPLIT_OWNER_PAGE} from './store.mjs';
/** Exact read-only script/key/argument descriptor. It grants no owner authority.
 * Owner-page native Lua returns at most two records, each at most64KiB. JSON
 * REST escaping is reserved at6x plus8KiB, including corrupt/control bytes; no old namespace is accepted. */
export function splitReadonlyRedisDescriptor(body,workspacePrefix){
 if(!Array.isArray(body)||String(body[0]).toLowerCase()!=='eval'||body[1]!==SPLIT_OWNER_PAGE)return;
 const match=/^bazaar-workspace:pilot-([a-f0-9]{32})$/.exec(workspacePrefix??'');
 const namespace=match?'bazaar:split:v1:pilot:'+match[1]:null;
 if(!namespace||body.length!==6||Number(body[2])!==1||typeof body[3]!=='string'||!new RegExp('^'+namespace+':owner:[a-f0-9]{64}$').test(body[3])||typeof body[4]!=='string'||!(body[4]==='-'||/^\([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body[4]))||body[5]!==namespace+':order:')throw Error('SPLIT_READ_TRANSPORT_INVALID');
 return {commands:4,responseBytes:6*2*65536+8192,keys:[body[3]]};
}
