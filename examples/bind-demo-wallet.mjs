// Local wallet proof only. No payment, funding, seed upload or recovery credential.
import {Keypair} from '@stellar/stellar-sdk';
import {pathToFileURL} from 'node:url';
import {withPrivateMcp} from './private-mcp-client.mjs';
import {openPortableSecretStore} from './buyer-portable-secret-store.mjs';
import {readPrivateInput} from './buyer-private-input.mjs';

export async function bindDemoWallet({url,agentAccess,keypair}){
  const endpoint=new URL(url);
  if(endpoint.pathname!=='/api/mcp'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password||
    (endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1'].includes(endpoint.hostname))))throw Error('INVALID_MCP_ENDPOINT');
  if(!/^[A-Za-z0-9_-]{43}$/.test(agentAccess))throw Error('INVALID_AGENT_ACCESS');
  return withPrivateMcp(endpoint.origin,agentAccess,async client=>{
  const call=async(name,args={})=>{
    const r=await client.callTool({name,arguments:args});
    const value=JSON.parse(r.content.find(c=>c.type==='text')?.text??'{}');
    if(r.isError||value.httpStatus>=400)throw Error(value.error?.code??'MCP_CALL_UNCONFIRMED');
    return value;
  };
  {
    const identity=await call('get_bazaar_identity');
    if(identity.network!=='stellar:testnet')throw Error('TESTNET_REQUIRED');
    if(identity.wallet){if(identity.wallet.wallet!==keypair.publicKey())throw Error('WALLET_RECOVERY_REQUIRED');return identity;}
    const challenge=await call('request_wallet_binding',{wallet:keypair.publicKey()});
    const message=JSON.parse(challenge.message);
    if(message.purpose!=='bazaar-wallet-binding/v1'||message.origin!==endpoint.origin||message.ownerId!==identity.ownerId||message.agentId!==identity.agentId||message.generation!==identity.generation||message.network!=='stellar:testnet'||message.wallet!==keypair.publicKey()||message.challengeId!==challenge.challengeId||message.expiresAt<=Date.now()||message.expiresAt>Date.now()+300000)throw Error('INVALID_WALLET_CHALLENGE');
    await call('complete_wallet_binding',{challengeId:challenge.challengeId,signature:keypair.sign(Buffer.from(challenge.message,'utf8')).toString('base64')});
    return await call('get_bazaar_identity');
  }
  });
}

export async function main(argv=process.argv.slice(2)){
  const args=[...argv],pipe=args.includes('--secret-stdin');if(pipe)args.splice(args.indexOf('--secret-stdin'),1);
  if(args.length!==1||args[0].startsWith('--'))throw Error('PRIVATE_BUYER_STORE_REQUIRED');
  const input=await readPrivateInput({prompt:'Buyer store passphrase: ',allowPipe:pipe});
  let store,keypair,config,release,password;
  try{
    password=pipe?Buffer.from(JSON.parse(input.toString('utf8')).password):Buffer.from(input);input.fill(0);
    store=await openPortableSecretStore({directory:args[0],password});password.fill(0);release=await store.acquireLock('wallet');
    config=await store.read('buyer-config');keypair=Keypair.fromSecret(config.stellarSecret);
    const identity=await bindDemoWallet({url:new URL('/api/mcp',config.origin).href,agentAccess:config.agentAccess,keypair});
    console.log(JSON.stringify({ownerId:identity.ownerId,agentId:identity.agentId,wallet:identity.wallet?.wallet,network:identity.network}));
  }finally{input.fill(0);password?.fill(0);keypair?._secretKey?.fill(0);if(config){delete config.stellarSecret;delete config.agentAccess;}await release?.();store?.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Wallet proof unconfirmed. Preserve the encrypted buyer store and recover identity before retrying.');process.exitCode=1;});
