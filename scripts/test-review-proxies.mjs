// Real loopback proxy and synthetic upstream; no provider, storage or credentials.
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const close=server=>new Promise(resolve=>server.close(resolve));
const seen=[];
const upstream=http.createServer((req,res)=>{
 seen.push({path:req.url,authorization:req.headers.authorization,cookie:req.headers.cookie});
 res.setHeader('Content-Type','text/html');res.end('<html><body>Fixture</body></html>');
});
const upstreamPort=await listen(upstream);
const reservation=http.createServer();const port=await listen(reservation);await close(reservation);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key)));
const child=spawn(process.execPath,['scripts/serve-text-review.mjs',String(port),String(upstreamPort)],{env,stdio:['ignore','pipe','pipe']});
const exited=once(child,'exit');
try{
 await Promise.race([
  once(child.stdout,'data'),
  exited.then(()=>{throw Error('Proxy exited before startup');}),
  new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Proxy startup timed out')),10000);timer.unref();}),
 ]);
 const origin=`http://127.0.0.1:${port}`;
 for(const path of ['/api','/api/operations','/api/x402/swap-risk','/%61pi/operations','/api%2foperations','/api/discovery/resources%2fextra']){
  const response=await fetch(origin+path,{redirect:'error'});assert.equal(response.status,403);await response.arrayBuffer();
 }
 const denied=await fetch(origin+'/catalogo',{method:'POST',body:'fixture'});assert.equal(denied.status,403);await denied.arrayBuffer();
 assert.equal(seen.length,0,'Blocked requests never reach the upstream');
 const page=await fetch(origin+'/catalogo',{headers:{authorization:'Bearer synthetic-not-a-credential',cookie:'fixture=true'},redirect:'error'});
 assert.equal(page.status,200);assert.match(await page.text(),/dataset\.reviewText='200'/);
 assert.equal(seen[0].authorization,undefined);assert.equal(seen[0].cookie,undefined);
 for(const path of ['/api/discovery/resources','/api/discovery/search?q=fixture']){
  const response=await fetch(origin+path,{redirect:'error'});assert.equal(response.status,200);await response.arrayBuffer();
 }
 assert.equal(seen.length,3);
 console.log('PASS loopback text proxy: blocked APIs, encoded paths and writes never reach upstream; public discovery works; auth/cookies not forwarded; text-enlargement injection present. Synthetic upstream only.');
}finally{
 child.kill();await exited;await close(upstream);
}
