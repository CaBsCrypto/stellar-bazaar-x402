import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {Keypair} from '@stellar/stellar-sdk';
import {openPortableSecretStore} from '../../examples/buyer-portable-secret-store.mjs';
import {createSellerCard,sellerHash,sellerCanonical} from '../../examples/seller-service-card.mjs';
import {createSellerIntent,bindSellerOrder,executeSellerIntent} from '../../examples/seller-marketplace-worker.mjs';

// Synthetic local process-crash fixture. No network, payment or real credential.
const [directory,operationId,crashAt]=process.argv.slice(2);
const store=await openPortableSecretStore({directory,password:Buffer.from('private test password'),create:true});
await store.acquireLock('seller.'+operationId); // Deliberately remains after exit.
const destination=Keypair.fromRawEd25519Seed(Buffer.alloc(32,1)).publicKey();
const {card,cardHash}=createSellerCard({id:'crash-text',name:'Crash fixture',description:'Synthetic text fixture',providerName:'Local fixture',providerOrigin:'https://seller.example.com',destination});
const agentId='5b6ce220-680c-40bf-8e75-fcbd1e8d3ac0',ownerId='ow_seller_fixture';
const intent=createSellerIntent({operationId,cardHash,serviceId:card.id,providerOrigin:card.url,ownerId,agentId});
const order={operationId,card,cardHash,serviceId:card.id,sellerOwnerId:ownerId,perspective:'sale',phase:'executing',attemptId:intent.attemptId,agentId,input:{prompt:'synthetic'},inputHash:sellerHash(sellerCanonical({prompt:'synthetic'})),settlement:card.payment.identity,paymentProtocol:card.payment.marketplace.protocol,amount:'0.01',destination,paymentVerifiedAt:'2026-10-07T12:00:00.000Z',transactionHash:'b'.repeat(64)};
intent.binding=bindSellerOrder(intent,order,['executing']);intent.phase='claimed';const journal=store.journal('seller.'+operationId);await journal.initialize(intent);
await executeSellerIntent(intent,{
 callTool:async name=>{if(name!=='get_market_order')throw Error('UNEXPECTED_EFFECT');return {structuredContent:{order},isError:false,content:[]};},
 persistIntent:async value=>{await journal.append(value);if(crashAt==='before'&&value.phase==='provider-started')process.exit(17);if(crashAt==='frozen'&&value.phase==='generated')process.exit(19);},
 adapter:{execute:async()=>{const file=await open(join(directory,'effect.marker'),'wx',0o600);try{await file.writeFile('one synthetic effect\n');await file.sync();}finally{await file.close();}if(crashAt==='after')process.exit(18);return {text:'Durably frozen output'};}},
});
throw Error('CRASH_FIXTURE_DID_NOT_EXIT');
