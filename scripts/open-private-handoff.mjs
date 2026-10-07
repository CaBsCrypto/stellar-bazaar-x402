import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
import {lstat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {writeNewOpenDpapiJson} from './open-hosted-private-session.mjs';
import {openAssert} from './open-acceptance-plan.mjs';

const origin='http://127.0.0.1:3117',redisOrigin='https://smooth-dory-323957.upstash.io';
function same(left,right){const a=Buffer.from(left??''),b=Buffer.from(right??'');return a.length===b.length&&timingSafeEqual(a,b);}
export function validateOpenLocalHandoff({method,path,requestOrigin,cookie,nonce,body}){
  openAssert(method==='POST'&&path==='/handoff'&&requestOrigin===origin&&same(cookie,'bazaar_handoff='+nonce),'LOCAL_HANDOFF_ORIGIN_REQUIRED');
  openAssert(body instanceof Uint8Array&&body.length>0&&body.length<=8192,'BOUNDED_LOCAL_HANDOFF_REQUIRED');
  const form=new URLSearchParams(Buffer.from(body).toString('utf8'));
  openAssert([...form.keys()].sort().join(',')==='nonce,redisCredential'&&form.getAll('nonce').length===1&&form.getAll('redisCredential').length===1&&same(form.get('nonce'),nonce),'LOCAL_HANDOFF_FORM_REQUIRED');
  const credential=form.get('redisCredential');openAssert(typeof credential==='string'&&credential.length>=20&&credential.length<=4096&&!/[\s\x00-\x1f\x7f]/.test(credential),'BOUNDED_REDIS_CREDENTIAL_REQUIRED');
  return {version:1,redisOrigin,redisCredential:credential};
}
/** One local, same-origin transfer from the browser clipboard into DPAPI.
 * Never logs, echoes, exports or sends the credential to a remote service. */
export async function serveOpenPrivateHandoff({privateDirectory}){
  openAssert(resolve(privateDirectory)===resolve('.vercel'),'EXACT_LOCAL_PRIVATE_DIRECTORY_REQUIRED');
  const folder=await lstat(privateDirectory);openAssert(folder.isDirectory()&&!folder.isSymbolicLink(),'REGULAR_PRIVATE_DIRECTORY_REQUIRED');
  const destination=resolve(privateDirectory,'open-controller-access.dpapi');
  try{await lstat(destination);throw Error('HANDOFF_ALREADY_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
  const nonce=randomBytes(32).toString('base64url');let submitted=false;
  const server=createServer(async(request,response)=>{
    response.setHeader('cache-control','no-store');response.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    response.setHeader('x-content-type-options','nosniff');response.setHeader('referrer-policy','no-referrer');
    try{
      openAssert(request.headers.host==='127.0.0.1:3117'&&!submitted,'LOCAL_HANDOFF_CLOSED');
      if(request.method==='GET'&&request.url==='/'){
        response.setHeader('set-cookie','bazaar_handoff='+nonce+'; HttpOnly; SameSite=Strict; Path=/');response.setHeader('content-type','text/html; charset=utf-8');
        response.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Acceso privado de aceptación</title><style>body{font:18px system-ui;max-width:38rem;margin:3rem auto;padding:1rem}input{display:block;width:100%;margin:1rem 0}button{padding:.8rem}</style><h1>Acceso privado de aceptación</h1><p>Guardar el acceso existente de Redis en un archivo cifrado de este equipo. No crea ni cambia credenciales.</p><form method="post" action="/handoff"><input type="hidden" name="nonce" value="'+nonce+'"><label for="redis">Token existente de Redis</label><input id="redis" type="password" name="redisCredential" autocomplete="off" required maxlength="4096"><button>Guardar cifrado localmente</button></form></html>');return;
      }
      const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;openAssert(size<=8192,'BOUNDED_LOCAL_HANDOFF_REQUIRED');chunks.push(chunk);}
      const body=Buffer.concat(chunks);let value;
      try{value=validateOpenLocalHandoff({method:request.method,path:request.url,requestOrigin:request.headers.origin,cookie:request.headers.cookie,nonce,body});submitted=true;await writeNewOpenDpapiJson(destination,value);}
      finally{body.fill(0);if(value)delete value.redisCredential;for(const chunk of chunks)chunk.fill(0);}
      response.setHeader('content-type','text/html; charset=utf-8');response.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Acceso guardado</title><h1>Acceso guardado cifrado</h1><p>No se realizó ninguna solicitud a Redis ni se abrió ninguna wallet.</p></html>');server.close();
    }catch{response.statusCode=400;response.end('LOCAL_HANDOFF_UNCONFIRMED');if(submitted)server.close();}
  });
  server.maxConnections=2;server.headersTimeout=10000;server.requestTimeout=15000;
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(3117,'127.0.0.1',accept);});
  return {origin,close:()=>new Promise(accept=>server.close(accept))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  openAssert(process.argv.slice(2).join(' ')==='--serve','USE_LOCAL_HANDOFF_SERVE');
  serveOpenPrivateHandoff({privateDirectory:resolve('.vercel')}).then(({origin})=>console.log(JSON.stringify({status:'LOCAL_HANDOFF_READY',origin,remoteRequests:0,walletReads:0}))).catch(()=>{console.error('LOCAL_HANDOFF_UNCONFIRMED');process.exitCode=1;});
}
