// Pure mathematical snapshot sizing for the reviewed native control paths.
// Backslash strings represent a JSON-string upper bound, not valid database
// records or a Lua/HTTP acceptance fixture. Nothing reads Redis or credentials.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const MiB=1048576,header=4096,scriptCap=65536,keyCap=512;
const caps=Object.freeze({registry:MiB,owner:131072,market:524288,settlement:131072,capacity:65536,permission:4096,index:512,patch:4096,configuration:512,operationRequest:512,marker:64,scope:64});
const sha=value=>createHash('sha256').update(value).digest('hex');
const widest=size=>'\\'.repeat(size);
const key='synthetic:'+ 'k'.repeat(keyCap-10),script='s'.repeat(scriptCap);
function request(keys,args){return Buffer.byteLength(JSON.stringify(['EVAL',script,keys,...Array(keys).fill(key),...args]))+header;}
function response(parts){return Buffer.byteLength(JSON.stringify({result:parts}))+header;}
const scalar=response(1),get=(cap)=>({rest:1,commands:1,out:Buffer.byteLength(JSON.stringify(['GET',key]))+header,in:response(widest(cap))});
const read=(owner=false,permission=false)=>({rest:1,commands:permission?5:4,out:request(permission?4:3,[]),in:response([widest(caps.registry),owner?widest(caps.owner):'',widest(caps.marker),...(permission?[widest(caps.permission)]:[])])});
const workspaceCas=owner=>({rest:1,commands:10,out:request(5,[widest(caps.registry),owner?widest(caps.owner):'',widest(caps.marker),widest(caps.registry),'',widest(caps.index),widest(caps.scope),widest(caps.patch)]),in:scalar});
const budget={rest:1,commands:4,out:request(1,[widest(caps.configuration),widest(caps.operationRequest)]),in:response([1,400000,'background',86400])};
function jointCas(release){const args=['present',widest(caps.market),'present',widest(caps.settlement),'present',widest(caps.capacity),widest(caps.market),'',widest(caps.capacity),'present',widest(caps.registry),'present',widest(caps.permission),'','present',widest(caps.index),widest(caps.index),widest(caps.scope),widest(caps.patch),...(release?[widest(caps.configuration),widest(caps.operationRequest)]:[])];return {rest:1,commands:release?17:14,out:request(release?8:7,args),in:scalar};}
const sum=rows=>rows.reduce((value,row)=>({rest:value.rest+row.rest,commands:value.commands+row.commands,out:value.out+row.out,in:value.in+row.in,combined:value.combined+row.out+row.in}),{rest:0,commands:0,out:0,in:0,combined:0});
/** Source-derived common sequence: classify credential read, operation lookup,
 * command debit, one ingress READ/index/CAS, second credential read, and one
 * account READ/index/CAS. There are no continuous CAS retries. */
const common=[read(),get(caps.market),budget,read(),get(caps.index),workspaceCas(false),read(),read(true),get(caps.index),workspaceCas(true)];
export function orderControlTypedBounds(){
 const commit=release=>[get(caps.market),get(caps.settlement),get(caps.capacity),get(caps.index),jointCas(release)];
 const report={version:1,status:'PASS_ANALYTICAL_NATIVE_ORDER_CONTROL_CAPS',caps,components:{common:sum(common),readWorkspace:read(),readOwner:read(true),readPermission:read(true,true),workspaceQuotaCas:workspaceCas(true),marketClaimCas:jointCas(false),marketDeliveryCas:jointCas(true)},paths:{orderRead:sum([...common,get(caps.market)]),orderClaim:sum([...common,read(true,true),...commit(false)]),orderDeliveryOrFailure:sum([...common,read(true,true),get(caps.market),...commit(true)])},sourceBranchAssumptions:['Only exact example proofs, validated native registry/owner snapshots, and the current 1-MiB/128-KiB/512-KiB caps.','Continuous ingress and account quotas each perform one READ/CAS attempt; definite contention fails closed without retry.','New native marked orders have initialized maintenance indices. Older missing-index bootstraps must keep the fallback bound or receive separate headroom.','GET/list/private order controls have no authenticated query observer. Delivery wake is charged in its independent background scope.','All strings use their cap at twice their source byte length, including CAS old/new arguments; scripts are bounded at64KiB and keys at512B, wider than the current source.'],networkRequests:0,redisCommands:0,luaExecutions:0,financialHandlerInvocations:0,payments:0,privateProfilesRead:0};
 return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const report=orderControlTypedBounds(),paths=['lib/demo-http.ts','lib/workspace-http.ts','lib/workspace-auth.ts','lib/workspace-store.ts','lib/marketplace.ts','lib/marketplace-store.ts','lib/marketplace-capacity.ts','lib/continuous-free-storage.ts'];report.sourcePins=Object.fromEntries(await Promise.all(paths.map(async path=>[path,sha(await readFile(path))])));console.log(JSON.stringify(report));}
