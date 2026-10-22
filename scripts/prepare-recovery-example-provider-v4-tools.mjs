// Local derivatives; existing frozen providers and receipts remain untouched.
import {readFile,writeFile} from 'node:fs/promises';
for(const name of ['prepare-recovery-example-provider','build-recovery-example-provider']){
 let source=await readFile('scripts/'+name+'-v3.mjs','utf8');
 source=source.replaceAll('provider-v3','provider-v4').replaceAll('2026-10-12','2026-10-13');
 if(name==='prepare-recovery-example-provider'){
  source=source.replace("'recovery-example-provider-io.mjs']", "'recovery-example-provider-io.mjs','seller-mcp-transport.mjs']");
  source=source.replace("executionMode:'on-demand',cronSchedules:[],", "executionMode:'on-demand',cronSchedules:[],mcpTransport:{serialization:'per-connection HTTP FIFO',privateFlag:'BAZAAR_EXAMPLE_PROVIDER_IO_PROFILE=example-bounded-provider-v1',onlyBoundedExampleAutoOptIn:true,retainsSseGet:true,requestsSkipped:0,retriesAdded:0},");
 }
 await writeFile('scripts/'+name+'-v4.mjs',source,{flag:'wx'});
}
console.log(JSON.stringify({status:'PREPARED_OFFLINE_PROVIDER_V4_TOOLS',networkRequests:0,privateFilesRead:0,cloudWrites:0}));
