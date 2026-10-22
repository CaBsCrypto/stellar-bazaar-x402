import {readFile,writeFile} from 'node:fs/promises';
import {assertSellerCard,sellerCanonical,sellerHash} from './examples/seller-service-card.mjs';
import {validateSellerConfiguration} from './examples/seller-mcp-transport.mjs';

const [packetPath,ownerId,agentId,output]=process.argv.slice(2);
if(!packetPath||!/^ow_[a-f0-9]{32}$/.test(ownerId??'')||!/^agent_[a-f0-9]{32}$/.test(agentId??'')||!output)throw Error('Use: configure.mjs card.json ow_PUBLIC_OWNER_ID agent_PUBLIC_AGENT_ID new-configuration.json');
const raw=await readFile(packetPath);if(raw.length>65536)throw Error('PUBLIC_CARD_TOO_LARGE');
const packet=JSON.parse(raw.toString('utf8'));assertSellerCard(packet.card);
if(packet.cardHash!==sellerHash(sellerCanonical(packet.card)))throw Error('CARD_HASH_MISMATCH');
const configuration=validateSellerConfiguration({bazaarOrigin:'https://bazaar.browns.studio',ownerId,agentId,...packet,allowedOrigins:[packet.card.url],controlProof:{method:'http-well-known',domain:new URL(packet.card.url).hostname}});
await writeFile(output,JSON.stringify(configuration,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({configuration:output,serviceId:configuration.card.id,cardHash:configuration.cardHash,secretsWritten:false,remoteRequests:0}));
