// Test-only loopback proxy: doubles computed text sizes after initial rendering.
// This tests text enlargement, not browser zoom. No application files are changed.
import http from 'node:http';
const port=Number(process.argv[2]??3234), upstreamPort=Number(process.argv[3]??3230);
if(![port,upstreamPort].every(n=>Number.isInteger(n)&&n>=1024&&n<=65535))throw Error('Invalid loopback ports');
const script=`<script>addEventListener('load',()=>setTimeout(()=>{
const sizes=[...document.body.querySelectorAll('*')].filter(e=>!['SCRIPT','STYLE','SVG','PATH'].includes(e.tagName)).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);
for(const [e,size] of sizes)if(Number.isFinite(size))e.style.setProperty('font-size',(size*2)+'px','important');
document.documentElement.dataset.reviewText='200';
},1000));</script>`;
http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(403);res.end('Read-only review');return;}
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname.includes('%')){res.writeHead(400);res.end();return;}
  const response=await fetch('http://127.0.0.1:'+upstreamPort+url.pathname+url.search,{redirect:'manual',headers:{accept:req.headers.accept??'*/*'}});
  const headers=Object.fromEntries([...response.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key)));
  const body=Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status,headers);
  res.end(response.headers.get('content-type')?.includes('text/html')?body.toString().replace('</body>',script+'</body>'):body);
 }catch{res.writeHead(503);res.end('Review upstream unavailable');}
}).listen(port,'127.0.0.1',()=>console.log('Text 200% review at http://127.0.0.1:'+port+'; read-only loopback proxy.'));
