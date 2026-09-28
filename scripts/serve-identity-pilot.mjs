// Operator-only loopback harness. Synthetic credentials only; no external storage or payments.
// node --experimental-strip-types scripts/serve-identity-pilot.mjs <hash-config.json> <synthetic-account-dir> [port=3261] [upstream=3219] [delay-ms=0]
// The config is a JSON array of provisioned account.json objects, re-read on EVERY request.
// Change that private file offline to rotate/revoke without deleting the in-memory deliveries.
import http from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { authenticateHistory, HistoryAuthError } from '../lib/operation-history-auth.ts';
import { createHistoryStore } from '../lib/operation-history-store.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createActivityStore } from '../lib/activity-store.ts';
import { createActivityHandlers } from '../lib/activity-http.ts';
import { createDeliverableStore } from '../lib/deliverable-store.ts';
import { createDeliverableHandlers } from '../lib/deliverable-http.ts';
import { reviewDeliveries } from '../lib/review-deliveries.ts';

const [configArg, seedArg, portArg='3261', upstreamArg='3219', delayArg='0'] = process.argv.slice(2);
if (!configArg || !seedArg) throw Error('Expected private hash-config file and synthetic account directory');
const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
function privatePath(path) {
  const full=realpathSync(resolve(path)), rel=relative(repo,full);
  if(rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${sep}`))) throw Error('Private inputs must be outside repository');
  return full;
}
const configPath=privatePath(configArg), seedPath=privatePath(seedArg);
const port=Number(portArg), upstreamPort=Number(upstreamArg), delay=Number(delayArg);
if (![port,upstreamPort].every(n=>Number.isInteger(n)&&n>=1024&&n<=65535)||port===upstreamPort||!Number.isInteger(delay)||delay<0||delay>30000) throw Error('Invalid loopback ports or delay');
const origin=`http://127.0.0.1:${port}`, upstream=`http://127.0.0.1:${upstreamPort}`;
const auth=(header,writing=false)=> {
  let config;
  try { config=readFileSync(configPath,'utf8'); } catch { throw new HistoryAuthError('HISTORY_UNAVAILABLE'); }
  return authenticateHistory(header,writing,config);
};
const records=new Map(), indexes=new Map();
// In-memory adapter, deliberately limited to inline fixture records. Not Redis durability evidence.
const redis={
  async eval(_script,keys,args) {
    if(keys.length!==2&&keys.length!==3) throw Error('Unsupported fixture storage operation');
    const delivery=keys.length===3, [id,digest]=args, entry=args[delivery?4:2], key=keys[0], index=keys[delivery?2:1];
    const map=records.get(key)??new Map();
    if(map.has(id)) return [JSON.parse(map.get(id)).digest===digest?'existing':'conflict',map.get(id)];
    map.set(id,entry);records.set(key,map);indexes.set(index,[id,...(indexes.get(index)??[])]);return ['created',entry];
  },
  async lrange(key,start,end){return (indexes.get(key)??[]).slice(start,end+1)},
  async hmget(key,...ids){return Object.fromEntries(ids.map(id=>[id,records.get(key)?.get(id)]))}
};
const operations=createHistoryStore(redis), events=createActivityStore(redis), deliveries=createDeliverableStore(redis);
const ops=createHistoryHandlers({authenticate:auth,store:()=>operations});
const activity=createActivityHandlers({authenticate:auth,operations:()=>operations,events:()=>events});
const delivery=createDeliverableHandlers({auth,history:()=>operations,store:()=>deliveries,objects:()=>{throw Error('No external file storage in identity pilot')}});
async function seed() {
  const credentials=JSON.parse(readFileSync(resolve(seedPath,'credentials.json'),'utf8'));
  const account=JSON.parse(readFileSync(resolve(seedPath,'account.json'),'utf8'));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  if(credentials.ownerId!==account.ownerId||hash(credentials.writeToken)!==account.writeTokenHash||hash(credentials.readToken)!==account.readTokenHash||auth(`Bearer ${credentials.writeToken}`,true).ownerId!==account.ownerId) throw Error('Synthetic seed account mismatch');
  const operation={clientOperationId:'identity-pilot-report',taskId:'identity-pilot-task',agentId:'identity-pilot-agent',mode:'mock',service:{id:'identity-pilot-report',title:'Informe sintético de identidad',provider:'Ejemplo local',url:'https://example.com'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient:'G'+'A'.repeat(55)},delivery:{status:'reported-delivered',result:{summary:'Piloto sintético de permisos; ninguna compra realizada.'}}};
  const request=(path,body)=>new Request(origin+path,{method:'POST',headers:{authorization:`Bearer ${credentials.writeToken}`,'content-type':'application/json'},body:JSON.stringify(body)});
  if((await ops.POST(request('/api/operations',operation))).status!==201) throw Error('Synthetic operation rejected');
  const report=structuredClone(reviewDeliveries.find(item=>item.manifest.content.kind==='report').manifest);
  report.title='Informe sintético de identidad';report.summary='Datos sintéticos para comprobar acceso, bloqueo y renovación. Sin pago.';
  if((await delivery.POST(request('/api/deliveries',{operationId:operation.clientOperationId,manifest:report}))).status!==201) throw Error('Synthetic delivery rejected');
}
await seed();
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,origin);
    if(url.origin!==origin||req.headers.host!==`127.0.0.1:${port}`) {res.writeHead(403);res.end();return;}
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>150000)throw Error('Body too large');chunks.push(chunk)}
    const incoming=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const handlers=url.pathname==='/api/operations'?ops:url.pathname==='/api/activity'?activity:url.pathname==='/api/deliveries'?delivery:null;
    let response;
    if(handlers) {
      response=await handlers[req.method]?.(incoming)??new Response(null,{status:405});
      if(delay&&req.method==='GET') await new Promise(resolve=>setTimeout(resolve,delay));
    } else if(url.pathname==='/api'||url.pathname.includes('%')||url.pathname.startsWith('/api/')||req.method!=='GET') response=Response.json({error:{code:'PILOT_ROUTE_DISABLED'}},{status:403});
    else response=await fetch(upstream+url.pathname+url.search,{redirect:'manual'});
    res.writeHead(response.status,{...Object.fromEntries([...response.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))), 'cache-control':'no-store','referrer-policy':'no-referrer'});
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch {res.writeHead(503,{'cache-control':'no-store'});res.end('Identity pilot unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic identity pilot ready: ${origin}/history; in-memory data only. No credentials logged.`));
