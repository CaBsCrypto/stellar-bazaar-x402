import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Keypair,Asset,Networks} from '@stellar/stellar-sdk';
import {loadPacket,savePacket} from './marketplace-private-packet.mjs';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const readJson=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const packet=await loadPacket();assert.ok(packet.completed.includes('pause'));assert.ok(!packet.completed.includes('revoke'));
const workspace=await readJson('docs/evidence/sprint-marketplace/hosted-workspace-manifest.json');
if(!packet.sale){
 const walletKeys=Array.from({length:2},()=>Keypair.random());
 packet.sale={planId:randomUUID(),wallets:walletKeys.map(v=>({publicKey:v.publicKey(),secret:v.secret()})),operator:randomBytes(32).toString('base64url'),reviewSecret:randomBytes(32).toString('base64url'),worker:randomBytes(32).toString('base64url'),invitations:Array.from({length:3},()=>randomBytes(32).toString('base64url')),submissionId:randomUUID(),orders:Array.from({length:2},()=>({operationId:randomUUID(),attemptId:randomUUID()})),completed:[],intents:[],providerReceipts:[]};
 await savePacket(packet);
}
const sale=packet.sale;
const providerHost='guionista-market-'+sale.planId.replaceAll('-','').slice(0,12)+'.vercel.app';
const issuer='GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const identity={kind:'stellar-classic-credit',network:'stellar:testnet',code:'USDC',issuer,sacContract:new Asset('USDC',issuer).contractId(Networks.TESTNET)};
sale.providerOrigin='https://'+providerHost;
sale.serviceId='guionista-algorithmic-text-pilot';
sale.input={topic:'Una comunidad de desarrolladores',durationSeconds:15,tone:'energético'};
await savePacket(packet);
const prefix=workspace.config.marketPrefix;
const manifest={version:1,planId:sale.planId,phase:'USDC-sale-preparation-NOT-EXECUTED',workspacePlanId:packet.planId,sourceSha:null,projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',providerProjectId:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K',teamId:'team_XjolcoWJ9V9yamVnCdpC7EMY',config:{...workspace.config,marketplace:true,purchases:false,admission:'invite-only',creationPaused:true,providerOrigin:sale.providerOrigin,identity},participants:packet.receipt.map((receipt,i)=>({ownerId:receipt.ownerId,workspaceId:receipt.workspaceId,role:i===0?'seller':'buyer',wallet:sale.wallets[i].publicKey})),payloads:{submissionId:sale.submissionId,serviceId:sale.serviceId,providerOrigin:sale.providerOrigin,input:sale.input,orders:sale.orders.map(v=>({operationId:v.operationId,attemptId:v.attemptId})),price:'0.01',assetIdentity:identity,pause:{action:'pause'},operatorHash:hash(sale.operator),workerHash:hash(sale.worker),admissionHashes:[...packet.identities.map(v=>hash(v.bootstrap)),...sale.invitations.map(hash)]},keys:{written:[...workspace.keys.written,prefix+':state',workspace.config.reviewPrefix+':state',prefix+':catalog:index',prefix+':catalog:card:'+sale.serviceId],ownerKeys:packet.receipt.map(v=>workspace.config.workspacePrefix+':{'+workspace.config.workspacePrefix.slice('bazaar-workspace:'.length)+'}:owner:'+v.ownerId),historical:'DENIED'},limits:{apiRequests:120,redisRestExchanges:400,redisCommandsUpperBound:2400,storedBytes:49164,storagePartitions:{workspace:12288,market:16384,review:12288,catalog:8192},outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300,marketPaymentSubmissions:2,totalTransferUsdc:'0.02',friendbotClaims:2,trustlineSubmissions:2,usdcFaucetClaims:1,maxFeeStroopsPerTransaction:1000,horizonReads:24,proofDnsRequests:4,proofHttpRequests:4,providerExecutionRequests:1,facilitatorRequests:0,automaticRetries:0,realMoney:0},measurement:{api:'native HTTP+MCP+browser private API',ssr:'separate server scope logs',browser:'HTML/static/redirect count must be recorded separately',storage:'partition caps before writes; union across metadata request IDs',provisioning:'separate exact wallet public keys and signed transaction hashes before effects'},privateData:{format:'Windows DPAPI CurrentUser outside Git',walletKeysSentToServer:false,redisCredentialPlaintextCopy:false},readiness:{localSaleMeasured:false,countersVerified:false,freeMarginRefreshed:false,payloadsFrozen:false,providerProofReady:false,walletProvisioned:false,canExecute:false},stop:['No final SHA and exact deployment/payload binding','Missing counts or measured limit exhausted','Unknown acknowledgement; preserve IDs and reconcile explicit reads','Wrong network, issuer, SAC, destination, amount or version']};
await writeFile('docs/evidence/sprint-marketplace/usdc-sale-manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({prepared:true,planId:sale.planId,existingOwners:2,newWorkspaces:0,wallets:2,providerOrigin:sale.providerOrigin,canExecute:false,keysStorage:'DPAPI only'}));
