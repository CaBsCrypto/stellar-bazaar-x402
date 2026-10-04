import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createProtectedPreviewFetch} from '../examples/protected-preview-client.mjs';
const directory=await mkdtemp(join(tmpdir(),'bazaar-protected-transport-test-')),authFile=join(directory,'auth.json');
await writeFile(authFile,JSON.stringify({token:'synthetic-vercel-test-auth'}));
let raw='HTTP/2 200 OK\r\ncontent-type: application/json\r\nx-bazaar-redis-requests: 2\r\n\r\n{"ok":true}',calls=0,config='',spawnArgs,spawnOptions,completed=0,uncertain=0;
const spawnProcess=(_binary,args,options)=>{
 calls++;spawnArgs=args;spawnOptions=options;
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 child.stdin=new Writable({write(chunk,_encoding,done){config+=chunk;done();},final(done){queueMicrotask(()=>{child.stdout.write(raw);child.emit('close',0);});done();}});return child;
};
try{
 const fetcher=await createProtectedPreviewFetch({origin:'https://fixed-preview.vercel.app',authFile,cliPath:'synthetic-cli.js',spawnProcess,beforeRequest:meta=>{assert.equal(meta.origin,'https://fixed-preview.vercel.app');assert.match(meta.payloadHash,/^[a-f0-9]{64}$/);},onResponse:async(meta,response)=>{completed++;assert.equal(meta.status,200);assert.equal(response.headers.get('x-bazaar-redis-requests'),'2');},onUncertain:()=>{uncertain++;}});
 const body=JSON.stringify({text:'Text\nwith a literal newline'});
 assert.deepEqual(await (await fetcher('https://fixed-preview.vercel.app/api/mcp',{method:'POST',headers:{authorization:'Bearer synthetic-private-token'},body})).json(),{ok:true});
 assert.ok(config.includes('Bearer synthetic-private-token'));assert.ok(config.includes('data = '));assert.equal(spawnArgs.some(value=>String(value).includes('synthetic-private-token')),false);assert.equal(spawnArgs.some(value=>String(value).includes('synthetic-vercel-test-auth')),false);assert.equal(spawnOptions.env.VERCEL_TOKEN,'synthetic-vercel-test-auth');assert.equal(spawnOptions.windowsHide,true);assert.ok(spawnArgs.includes('--retry'));assert.equal(spawnArgs.includes('--location'),false);assert.equal(completed,1);
 for(const url of ['https://other-preview.vercel.app/api/mcp','https://fixed-preview.vercel.app/api/mcp?token=hidden','https://fixed-preview.vercel.app/api/mcp#hidden'])await assert.rejects(fetcher(url),/UNBOUND_TRANSPORT/);
 assert.equal(calls,1);
 raw='HTTP/2 302 Found\r\nlocation: https://other-preview.vercel.app/\r\n\r\n';await assert.rejects(fetcher('https://fixed-preview.vercel.app/api/mcp'),/REDIRECT_DENIED/);assert.equal(calls,2);assert.equal(uncertain,1);
 raw='not-an-http-response';await assert.rejects(fetcher('https://fixed-preview.vercel.app/api/mcp'),/HTTP_ENVELOPE/);assert.equal(calls,3);assert.equal(uncertain,2);
 console.log(JSON.stringify({status:'PASS',fixedOrigin:true,secretsInArgv:false,redirects:0,retries:0,externalRequests:0}));
}finally{await rm(directory,{recursive:true,force:true});}
