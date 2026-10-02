import {readFile,writeFile} from 'node:fs/promises';
const path='docs/evidence/sprint-marketplace/closed-preview-http.json';
const report=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const clean={status:report.status,deploymentId:report.deploymentId,url:report.url,checks:report.checks.map(c=>({path:c.path,method:c.method,status:c.status,bytes:c.bytes,headers:c.headers.map(h=>typeof h==='string'?h:h.value)})),httpRequests:report.httpRequests,retries:report.retries,redisRequests:report.redisRequests,payments:report.payments,limitation:report.limitation};
await writeFile(path,JSON.stringify(clean,null,2)+'\n');console.log(JSON.stringify(clean));
