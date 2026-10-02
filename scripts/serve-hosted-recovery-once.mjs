import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {loadPacket} from './marketplace-private-packet.mjs';
const mode=process.argv[2];if(!['original','rotated'].includes(mode))throw Error('MODE_REQUIRED');
const deployment=JSON.parse((await readFile('docs/evidence/sprint-marketplace/hosted-workspace-current.json','utf8')).replace(/^\uFEFF/,''));
const origin=new URL(deployment.url).origin;
if(!/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(origin))throw Error('PREVIEW_REQUIRED');
const packet=await loadPacket();if(!packet.completed.includes('journey'))throw Error('JOURNEY_REQUIRED');
const token=packet.identities[0][mode==='original'?'human':'rotatedHuman'];
let served=false;
const server=createServer((req,res)=>{
 if(served||req.method!=='GET'||req.url!=='/recover'||req.headers.host!=='127.0.0.1:3283'){res.writeHead(404);res.end();return;}
 served=true;
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; base-uri 'none'; form-action 'none'"});
 res.end('<!doctype html><html lang="es"><title>Recuperación sintética</title><h1>Recuperar la entrega hospedada</h1><p>Acceso humano sintético conservado con Windows DPAPI. Enlace servido una sola vez; no se guarda en archivos de texto.</p><a rel="noreferrer" href="'+origin+'/history#token='+token+'">Recuperar espacio sintético</a></html>');
 server.close();clearTimeout(timer);
});
const timer=setTimeout(()=>{server.closeAllConnections();server.close();},30000);
server.listen(3283,'127.0.0.1',()=>console.log('Recovery handoff ready at http://127.0.0.1:3283/recover; one GET; no Redis requests.'));
