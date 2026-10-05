import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Loopback only, no browser control, credentials, DPAPI or remote requests.
export async function serveCaptureFixture({out,port=0}={}) {
 const runId=randomUUID(),requests=[],connections=new Set(),startedAt=new Date().toISOString();let sequence=0,origin,timer;
 const cases={redirect:false,partial:false,sse:false,websocket:false};
 const partial=Buffer.from('partial-fixture'),sse=Buffer.from('event: fixture\ndata: first\n\nevent: fixture\ndata: second\n\n'),ws=Buffer.from('websocket-fixture');
 const html=Buffer.from(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Fixture de captura local</title><h1>Fixture local HTTP, SSE y WebSocket</h1><p id="result">Ejecutando una vez…</p><script>
 (async()=>{const done=[];done.push(await fetch('/redirect',{cache:'no-store'}).then(r=>r.text()).then(()=> 'redirect'));
 try{await fetch('/partial',{cache:'no-store'}).then(r=>r.text());done.push('partial-missing-failure');}catch{done.push('partial-observed');}
 done.push(await fetch('/sse',{cache:'no-store'}).then(r=>r.text()).then(()=> 'sse'));
 await new Promise((resolve,reject)=>{const socket=new WebSocket('ws://'+location.host+'/ws');socket.onmessage=()=>socket.close(1000,'fixture-complete');socket.onclose=()=>resolve();socket.onerror=()=>reject(Error('websocket failed'));});done.push('websocket');document.getElementById('result').textContent='Terminado: '+done.join(', ');})().catch(()=>document.getElementById('result').textContent='FAIL: fixture incompleto');
 </script>`);
 const record=(request,path)=>{const row={id:++sequence,method:request.method,path,status:null,requestBodyBytes:0,responseBodyBytes:0,startedAt:new Date().toISOString(),terminal:false};requests.push(row);return row;};
 const snapshot=()=>({version:1,status:Object.values(cases).every(Boolean)?'PASS_LOCAL_STIMULUS':'INCOMPLETE_LOCAL_STIMULUS',runId,origin,startedAt,finishedAt:new Date().toISOString(),cases,requests,expected:{redirectHops:2,partialBodyBytes:partial.length,sseBodyBytes:sse.length,websocketMessageBytes:ws.length,websocketServerFrameBytes:2+ws.length,partialIsIntentional:true},networkScope:'loopback fixture only; a server ledger is not a browser capture',automaticRetriesConfigured:0,completeBrowserTransport:false,remoteRequests:0,secretReads:0});
 async function save(){if(!out)return;await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(resolve(out),JSON.stringify(snapshot(),null,2)+'\n');}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{save().catch(()=>{});},500);}
 const server=createServer((request,response)=>{
  const path=new URL(request.url,'http://127.0.0.1').pathname,row=record(request,path);request.on('data',chunk=>row.requestBodyBytes+=chunk.length);
  response.setHeader('cache-control','no-store');response.setHeader('x-fixture-run-id',runId);response.setHeader('connection','close');
  const send=(status,body,type='text/plain')=>{const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);row.status=status;response.writeHead(status,{'content-type':type,'content-length':bytes.length});row.responseBodyBytes+=bytes.length;response.end(bytes);};
  response.once('finish',()=>{row.terminal=true;row.outcome='finished';schedule();});response.once('close',()=>{row.terminal=true;row.outcome??='closed';schedule();});
  if(path==='/')send(200,html,'text/html; charset=utf-8');
  else if(path==='/redirect'){row.status=302;response.writeHead(302,{location:'/target','content-length':0});response.end();}
  else if(path==='/target'){cases.redirect=true;send(200,'redirect-fixture');}
  else if(path==='/partial'){row.status=200;response.writeHead(200,{'content-type':'text/plain','content-length':partial.length+100});response.flushHeaders();response.write(partial);row.responseBodyBytes=partial.length;setTimeout(()=>{cases.partial=true;row.outcome='intentional-aborted-body';response.destroy();schedule();},100);}
  else if(path==='/sse'){row.status=200;response.writeHead(200,{'content-type':'text/event-stream','content-length':sse.length});response.flushHeaders();const middle=sse.indexOf('event:',1);response.write(sse.subarray(0,middle));row.responseBodyBytes+=middle;setTimeout(()=>{response.end(sse.subarray(middle));row.responseBodyBytes+=sse.length-middle;cases.sse=true;schedule();},100);}
  else if(path==='/favicon.ico')send(204,Buffer.alloc(0));
  else send(404,'fixture-not-found');
 });
 server.on('connection',socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket));});
 server.on('upgrade',(request,socket)=>{
  const row=record(request,'/ws');row.status=101;
  const key=request.headers['sec-websocket-key'];if(typeof key!=='string'){socket.destroy();row.terminal=true;row.outcome='invalid-upgrade';return;}
  const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const frame=Buffer.concat([Buffer.from([0x81,ws.length]),ws]);socket.write(frame);row.websocketServerFrameBytes=frame.length;
  socket.on('data',chunk=>{row.websocketClientFrameBytes=(row.websocketClientFrameBytes??0)+chunk.length;if((chunk[0]&15)===8){socket.end(Buffer.from([0x88,0]));row.websocketServerFrameBytes+=2;cases.websocket=true;}});
  socket.on('close',()=>{row.terminal=true;row.outcome='websocket-closed';schedule();});socket.on('error',()=>{});
 });
 await new Promise(done=>server.listen(port,'127.0.0.1',done));origin='http://127.0.0.1:'+server.address().port;
 return {origin,runId,snapshot,save,close:async()=>{clearTimeout(timer);for(const socket of connections)socket.destroy();await new Promise(done=>server.close(done));await save();}};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--out')throw Error('USAGE: node serve-x402-capture-fixture.mjs --out PRIVATE_OR_PUBLIC_LEDGER.json');
 const fixture=await serveCaptureFixture({out:args[1]});console.log(JSON.stringify({status:'LOCAL_FIXTURE_READY',origin:fixture.origin,runId:fixture.runId,out:resolve(args[1]),routes:['/','/redirect','/target','/partial','/sse','/ws','/favicon.ico'],remoteRequests:0,secretReads:0}));
 process.stdin.setEncoding('utf8');process.stdin.on('data',async input=>{if(input.trim()==='snapshot'){await fixture.save();console.log(JSON.stringify(fixture.snapshot()));}else if(input.trim()==='stop'){await fixture.close();process.exit(0);}});
}
