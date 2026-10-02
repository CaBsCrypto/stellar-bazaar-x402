import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Keypair} from '@stellar/stellar-sdk';
import {savePacket,loadPacket,packetPath} from './marketplace-private-packet.mjs';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
let packet;
try {packet=await loadPacket();} catch(e) {
 if(e.code!=='ENOENT')throw e;
 const identities=Array.from({length:2},()=>Object.fromEntries(['bootstrap','human','agent','rotatedHuman','rotatedAgent'].map(k=>[k,randomBytes(32).toString('base64url')])));
 packet={version:1,planId:randomUUID(),identities,creations:identities.map(v=>({creationId:randomUUID(),humanAccessHash:hash(v.human),agentAccessHash:hash(v.agent)})),conversation:{conversationId:randomUUID(),title:'Aceptación hospedada con Redis real'},message:{messageId:randomUUID(),taskId:randomUUID(),text:'Conserva esta conversación y entrega de texto al sustituir Vercel.'},claim:{attemptId:randomUUID()},response:{messageId:randomUUID(),text:'Entrega sintética exacta: Redis real, MCP externo y recuperación.'},receipt:[],completed:[]};
 await savePacket(packet,true);
}
if(!packet.operation){packet.operation={clientOperationId:randomUUID(),mode:'fixture',taskId:packet.message.taskId,service:{id:'hosted-workspace-text-acceptance',title:'Entrega MCP sintética hospedada',provider:'Agente sintético externo',url:'https://bazaar.browns.studio'},payment:{status:'not-requested',network:'stellar:testnet',asset:'XLM',amountAtomic:'0',recipient:Keypair.random().publicKey()},delivery:{status:'reported-delivered',result:{text:packet.response.text}}};await savePacket(packet);}
if(!packet.pauseProbe){packet.pauseProbe={...packet.creations[1],creationId:randomUUID()};await savePacket(packet);}
const prep=JSON.parse((await readFile('docs/evidence/sprint-marketplace/real-preparation-manifest.json','utf8')).replace(/^\uFEFF/,''));
const manifest={version:1,planId:packet.planId,phase:'hosted-workspace-before-effects',sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),projectId:prep.projectId,teamId:prep.teamId,redis:prep.redis,config:{...prep.config,marketplace:false,purchases:false,meter:true},keys:{written:prep.keys.written.filter(k=>k.startsWith('bazaar-workspace:')),serverAssignedOwnerKeys:prep.keys.serverAssignedOwnerKeys,readOnlySentinel:prep.keys.readOnlySentinel,historicalKeys:'DENIED'},payloads:{creations:packet.creations,inviteHashes:packet.identities.map(v=>hash(v.bootstrap)),conversation:packet.conversation,message:packet.message,claim:{taskId:packet.message.taskId,...packet.claim},response:{attemptId:packet.claim.attemptId,...packet.response},hashes:{creations:packet.creations.map(hash),conversation:hash(packet.conversation),message:hash(packet.message)}},privateAccess:{format:'Windows DPAPI CurrentUser; encrypted file outside repository',packetPath,plaintextRedisCredential:'never stored locally'},limits:{appRequests:64,redisRestExchanges:512,redisCommandsUpperBound:3584,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,newStoredBytes:1048576,activeExecutionSeconds:300,ownerCount:2,transportRetries:0,ledgerRequests:0,facilitatorRequests:0,deployments:3},measurement:{redisRequests:'SDK middleware, per-request and executor aggregate',commands:'EVAL + static redis.call upper bound; reviewed scripts without loops',bytes:'JSON payloads only, excluding HTTP/TLS framing',browser:'server metadata logs, no payloads or access values'},readiness:{privatePayloadsBound:true,countersNativeVerified:false,freeMarginRefreshed:false,canExecute:false},stop:prep.stop};
manifest.payloads.operation=packet.operation;
manifest.payloads.hashes.operation=hash(packet.operation);
manifest.payloads.rotation=packet.identities.map(v=>({human:hash(v.rotatedHuman),agent:hash(v.rotatedAgent)}));
manifest.payloads.pauseProbe=packet.pauseProbe;
await writeFile('docs/evidence/sprint-marketplace/hosted-workspace-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({prepared:true,planId:packet.planId,identities:2,accessStorage:'DPAPI encrypted; no plaintext access file',canExecute:false}));
