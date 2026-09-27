// Local-only public discovery fixture. Never load deployment credentials or write a real registry.
import http from 'node:http';
import { existsSync } from 'node:fs';
const port=Number(process.argv.find(value=>value.startsWith('--port='))?.split('=')[1]??3221);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port');
for (const name of ['.env','.env.local','.env.production','.env.production.local']) if(existsSync(name)) throw Error('Refusing review with environment files');
for (const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','X402_PAYER_SECRET','STELLAR_X402_FACILITATOR_API_KEY']) delete process.env[key];
process.env.X402_PILOT_PAYMENTS_ENABLED='false';
const {services}=await import('../lib/catalog.ts');
const {toServiceCard}=await import('../lib/service-card.ts');
const {createDynamicServiceCard,storageMode}=await import('../lib/dynamic-registry.ts');
if(storageMode()!=='memory') throw Error('Only isolated memory is allowed');
const card={...toServiceCard(services[0]),id:'mission-public-example',name:'Servicio sintético de revisión',description:'Ejemplo local del registro público para comparar catálogo, ficha y herramientas. No se compra ni llama al proveedor.',url:'https://example.com/mission-fixture'};
await createDynamicServiceCard(card,'synthetic-not-a-provider-key');
if(process.argv.includes('--unavailable')) globalThis.__bazaar_dynamic_registry.values=()=>{throw Error('Simulated registry unavailable')};
const next=(await import('next')).default;
const app=next({dev:false,hostname:'127.0.0.1',port});
await app.prepare();
if(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL||process.env.X402_PILOT_PAYMENTS_ENABLED!=='false') throw Error('Unexpected review configuration');
const handle=app.getRequestHandler();
http.createServer((req,res)=>{
  const path=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
  if(!['GET','HEAD'].includes(req.method)||path==='/api'||path.includes('%')||(path.startsWith('/api/')&&!['/api/discovery/resources','/api/discovery/search'].includes(path))) {res.writeHead(403);res.end('Review only');return;}
  return handle(req,res);
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic discovery review at http://127.0.0.1:${port}; no public writes, payments or provider calls.`));
