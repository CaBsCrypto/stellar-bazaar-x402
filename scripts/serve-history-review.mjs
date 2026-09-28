// Loopback-only UI harness. Real HTTP/auth handlers, synthetic accounts and in-memory storage.
// No real credentials, facilitator, Redis or object storage are used.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { authenticateHistory } from '../lib/operation-history-auth.ts';
import { createHistoryStore } from '../lib/operation-history-store.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createActivityStore } from '../lib/activity-store.ts';
import { createActivityHandlers } from '../lib/activity-http.ts';
import { createDeliverableStore } from '../lib/deliverable-store.ts';
import { createDeliverableHandlers } from '../lib/deliverable-http.ts';
import { reviewDeliveries } from '../lib/review-deliveries.ts';

const port=Number(process.argv[2]??3212), upstreamPort=Number(process.argv[3]??3211);
if(![port,upstreamPort].every(value=>Number.isInteger(value)&&value>=1024&&value<=65535)) throw Error('Invalid loopback review ports');
const origin=`http://127.0.0.1:${port}`, upstream=`http://127.0.0.1:${upstreamPort}`;

const hash = value => createHash('sha256').update(value).digest('hex');
// Public fixture credentials valid only inside this process; never production access.
const read = 'review-reader-'.padEnd(43,'r'), write = 'review-writer-'.padEnd(43,'w');
const config = JSON.stringify([{ownerId:'mission-fixture',readTokenHash:hash(read),writeTokenHash:hash(write)}]);
const auth = (header, writing=false) => authenticateHistory(header,writing,config);
const records = new Map(), indexes = new Map();
const redis = {
  async eval(_script,keys,args) {
    const delivery = keys.length === 3;
    const [id,digest] = args, entry = args[delivery ? 4 : 2], key=keys[0], index=keys[delivery ? 2 : 1];
    const map=records.get(key)??new Map();
    if(map.has(id)) return [JSON.parse(map.get(id)).digest===digest?'existing':'conflict',map.get(id)];
    map.set(id,entry); records.set(key,map); indexes.set(index,[id,...(indexes.get(index)??[])]);
    return ['created',entry];
  },
  async lrange(key,start,end){return (indexes.get(key)??[]).slice(start,end+1)},
  async hmget(key,...ids){return Object.fromEntries(ids.map(id=>[id,records.get(key)?.get(id)]))}
};
const operations=createHistoryStore(redis), events=createActivityStore(redis), deliveries=createDeliverableStore(redis);
const ops=createHistoryHandlers({authenticate:auth,store:()=>operations});
const activity=createActivityHandlers({authenticate:auth,operations:()=>operations,events:()=>events});
const delivery=createDeliverableHandlers({auth,history:()=>operations,store:()=>deliveries,objects:()=>{throw Error('No object storage in fixture')}});
const operation={clientOperationId:'mission-report',taskId:'mission-task',agentId:'mission-agent',mode:'mock',service:{id:'mission-report',title:'Informe sintético de revisión',provider:'Ejemplo local',url:'https://example.com'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient:'G'+'A'.repeat(55)},delivery:{status:'reported-delivered',result:{summary:'Simulación local; ninguna compra realizada.'}}};
const request=(path,body)=>new Request(origin+path,{method:'POST',headers:{authorization:`Bearer ${write}`,'content-type':'application/json'},body:JSON.stringify(body)});
if((await ops.POST(request('/api/operations',operation))).status!==201) throw Error('Fixture operation rejected');
const report=structuredClone(reviewDeliveries.find(item=>item.manifest.content.kind==='report').manifest);
report.title='Informe sintético de revisión'; report.summary='Datos de ejemplo para validar acceso y bloqueo. Sin pago.';
if((await delivery.POST(request('/api/deliveries',{operationId:operation.clientOperationId,manifest:report}))).status!==201) throw Error('Fixture delivery rejected');

http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,origin);
    const chunks=[]; let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>150000)throw Error('Body too large');chunks.push(chunk)}
    const incoming=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const handlers=url.pathname==='/api/operations'?ops:url.pathname==='/api/activity'?activity:url.pathname==='/api/deliveries'?delivery:null;
    let response;
    if(handlers) response=await handlers[req.method]?.(incoming)??new Response(null,{status:405});
    else if(url.pathname==='/api'||url.pathname.includes('%')||url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(req.method)) response=Response.json({error:{code:'FIXTURE_ROUTE_DISABLED'}},{status:403});
    else response=await fetch(upstream+url.pathname+url.search,{redirect:'manual'});
    res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.writeHead(503);res.end('Fixture unavailable')}
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic private UI harness: ${origin}/history. Fixed public fixture credentials documented in source; no real credentials.`));
