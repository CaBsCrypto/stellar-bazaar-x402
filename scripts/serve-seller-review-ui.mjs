// Real Next UI with a read-only, loopback Redis protocol double. Never contacts Upstash.
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=process.argv.find(x=>x.startsWith('--directory='))?.slice(12);
const port=Number(process.argv.find(x=>x.startsWith('--port='))?.slice(7)??3253);
if(!directory||!path.isAbsolute(directory))throw Error('Absolute isolated synthetic directory required');
for(const name of ['.env','.env.local','.env.production','.env.production.local']) {
  if(existsSync(path.join(root,name)))throw Error('Refusing UI fixture with environment files present');
}
const entries=()=>JSON.parse(readFileSync(path.join(directory,'synthetic-registry.json'),'utf8'));
const command=cmd=>{
  const [name,...args]=cmd;
  const rows=entries();
  if(name.toLowerCase()==='smembers'&&args[0]==='bazaar:index')return {result:rows.map(x=>x.id)};
  if(['get','mget'].includes(name.toLowerCase())&&args.every(x=>x.startsWith('bazaar:card:'))){
    const values=args.map(key=>{const row=rows.find(x=>x.id===key.slice(12));return row?JSON.stringify(row):null;});
    return {result:name.toLowerCase()==='get'?values[0]:values};
  }
  return {error:'Fixture is read-only and restricted to synthetic public cards'};
};
const server=http.createServer(async(req,res)=>{
  if(req.headers.authorization!=='Bearer synthetic-ui-only'){res.writeHead(401);res.end();return;}
  try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>32768)throw Error('Body too large');chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString());
    const result=Array.isArray(input[0])?input.map(command):command(input);
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
  }catch{res.writeHead(400);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const env={};
for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
  UPSTASH_REDIS_REST_URL:`http://127.0.0.1:${server.address().port}`,UPSTASH_REDIS_REST_TOKEN:'synthetic-ui-only',
  BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_PROVIDER_REVIEW_DIR:directory,
  BAZAAR_ENABLE_REGISTRY_MUTATIONS:'false',X402_PILOT_PAYMENTS_ENABLED:'false'});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:'inherit'});
child.on('exit',code=>{server.close();process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill();server.close();});
console.log(JSON.stringify({fixture:'synthetic-read-only-registry',url:`http://127.0.0.1:${port}`,externalCredentials:false}));
