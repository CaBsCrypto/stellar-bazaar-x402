import {writeFile} from 'node:fs/promises';
const targets=[
 ['scriptwriter','https://ai-video-scriptwriter.vercel.app/api/service-card'],
 ['website-intelligence','https://website-intelligence-provider.vercel.app/v1/service-card'],
];
const results=[];
for(const [provider,url] of targets){
 const result={provider,url,method:'GET',checkedAt:new Date().toISOString(),retry:0};
 try{
  const r=await fetch(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});result.status=r.status;
  const reader=r.body?.getReader();let n=0,parts=[];
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>131072){await reader.cancel();throw Error('RESPONSE_LIMIT');}parts.push(value);}
  result.bytes=n;
  if(r.ok){const card=JSON.parse(Buffer.concat(parts).toString());result.publicContract={id:card.id??null,version:card.version??null,kind:card.kind??null,network:card.network??null,routeTemplate:card.routeTemplate??null,payment:{scheme:card.payment?.scheme??null,asset:card.payment?.asset??null,amount:card.payment?.amount??null,enabled:card.payment?.enabled??null},contentType:card.delivery?.result?.contentType??null};}
 }catch(e){result.error=e.message==='RESPONSE_LIMIT'?'RESPONSE_LIMIT':'READ_UNAVAILABLE';}
 results.push(result);
}
const report={results,requests:targets.length,writes:0,executionRequests:0,payments:0,limitation:'Read-only public contract lookup; no ownership proof or seller MCP execution.'};
await writeFile('docs/evidence/sprint-marketplace/existing-provider-readonly.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
