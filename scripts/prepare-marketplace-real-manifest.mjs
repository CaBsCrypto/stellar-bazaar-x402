import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const hash=v=>createHash('sha256').update(v).digest('hex');
const suffix=randomBytes(16).toString('hex'),tag='pilot-'+suffix;
const ws='bazaar-workspace:'+tag,market='bazaar-market:'+tag,review='bazaar-review:'+tag;
const measured=JSON.parse(await readFile('docs/evidence/sprint-marketplace/native-local.json','utf8'));
const manifest={version:1,id:randomUUID(),phase:'REAL-preparation-NOT-EXECUTED',
 sourceSha:'a3f1d847b0d69f8e193225cb4887e0945219dbf6',
 closedDeployment:'dpl_wASY6jpNsQ2zD5yCj7swvWYsz42U',
 projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',teamId:'team_XjolcoWJ9V9yamVnCdpC7EMY',
 redis:{databaseId:'1f90faef-48d7-49b3-916a-c378e13a8c23',url:'https://smooth-dory-323957.upstash.io',plan:'Free',credentialScope:'whole database; prefixes are logical isolation only',observedRoundedCommands:'2.9k / 500k',observedRoundedStorage:'6 KB / 256 MB',observedAt:'2026-10-02',mustRefreshBeforeEffects:true},
 config:{workspacePrefix:ws,marketPrefix:market,reviewPrefix:review,dynamicPrefix:market+':catalog',admission:'invite-only',ownerLifetimeLimit:5,syntheticParticipants:2,invitedDevelopers:3,requestsPerMinute:120,requestsPerDay:1000,transportRetries:0,facilitatorRequests:0},
 keys:{written:[ws+':{'+tag+'}:registry',ws+':{'+tag+'}:initialized',market+':state',review+':state',market+':catalog:index',market+':catalog:card:market-text-acceptance-seller'],serverAssignedOwnerKeys:{pattern:ws+':{'+tag+'}:owner:ow_<32hex>',maximumSynthetic:2,maximumLifetime:5,bindFromAuthenticatedReceiptBeforeOwnerWrites:true},readOnlySentinel:ws+':{'+tag+'}:owner:none',historicalKeys:'DENIED; no migration, overwrites or deletes'},
 payloads:{creation:'UUID + bootstrap bearer; human/agent SHA256 hashes. Exact private packets not prepared yet.',service:'market-text-acceptance-seller; existing HTTPS endpoint; new owned text/plain contract; seller destination/payer and proof still unresolved',order:'saved UUID + cardHash + payer + scalar input, immutable before wallet signing',delivery:'saved attemptId, text <=2000 chars, SHA256, same operationId',pause:{action:'pause'},exactPayloadHashes:'PENDING; do not execute from this preparation'},
 measuredLocal:{appRequests:measured.appRequests,redisRestExchanges:measured.redisRequests,redisCommands:measured.redisCommands,ledgerRequests:measured.ledgerRequests,externalRequests:0,buildId:measured.buildId,limitations:[measured.domainProof,measured.payment,measured.storage]},
 proposedRealLimits:{appRequests:128,redisRestExchanges:1024,redisCommands:4096,ledgerReads:12,testnetSubmissions:2,totalTransferXlm:'0.02',maxFeeStroopsPerTransaction:1000,realMoney:0,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,newStoredBytes:1048576,executionSeconds:300,automaticRetries:0,facilitatorRequests:0},
 readiness:{credentialsConfigured:false,privatePayloadsBound:false,realCountersReady:false,endpointProofReady:false,sellerAgentConnected:false,syntheticWalletsReady:false,canExecute:false},
 stop:['Any lost acknowledgement or unknown transport outcome; preserve identifiers and reconcile by explicit reads only.','Measured limit reached or missing counter.','Wrong namespace/recipient/network/card version/price/hash.','No current Free margin or bound payload.'],
 openingGate:'Only after hosted complete acceptance and reversal; retain history, deliveries and revocations; no invitations sent.'};
await writeFile('docs/evidence/sprint-marketplace/real-preparation-manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({prepared:true,canExecute:false,id:manifest.id,keys:manifest.keys.written.length,newPrefixes:[ws,market,review]}));
