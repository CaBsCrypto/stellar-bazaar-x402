// Local wallet proof only. No payment, funding, seed upload or recovery credential.
import {Keypair} from '@stellar/stellar-sdk';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function bindDemoWallet({url,agentAccess,keypair}){
  const endpoint=new URL(url);
  if(endpoint.pathname!=='/api/mcp'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password||
    (endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1'].includes(endpoint.hostname))))throw Error('INVALID_MCP_ENDPOINT');
  if(!/^[A-Za-z0-9_-]{43}$/.test(agentAccess))throw Error('INVALID_AGENT_ACCESS');
  const client=new Client({name:'bazaar-demo-wallet',version:'1.0.0'});
  const transport=new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{Authorization:'Bearer '+agentAccess}}});
  const call=async(name,args={})=>{
    const r=await client.callTool({name,arguments:args});
    const value=JSON.parse(r.content.find(c=>c.type==='text')?.text??'{}');
    if(r.isError||value.httpStatus>=400)throw Error(value.error?.code??'MCP_CALL_UNCONFIRMED');
    return value;
  };
  try{
    await client.connect(transport);
    const identity=await call('get_bazaar_identity');
    if(identity.network!=='stellar:testnet')throw Error('TESTNET_REQUIRED');
    if(identity.wallet){if(identity.wallet.wallet!==keypair.publicKey())throw Error('WALLET_RECOVERY_REQUIRED');return identity;}
    const challenge=await call('request_wallet_binding',{wallet:keypair.publicKey()});
    const message=JSON.parse(challenge.message);
    if(message.purpose!=='bazaar-wallet-binding/v1'||message.origin!==endpoint.origin||message.ownerId!==identity.ownerId||message.agentId!==identity.agentId||message.generation!==identity.generation||message.network!=='stellar:testnet'||message.wallet!==keypair.publicKey()||message.challengeId!==challenge.challengeId||message.expiresAt<=Date.now()||message.expiresAt>Date.now()+300000)throw Error('INVALID_WALLET_CHALLENGE');
    await call('complete_wallet_binding',{challengeId:challenge.challengeId,signature:keypair.sign(Buffer.from(challenge.message,'utf8')).toString('base64')});
    return await call('get_bazaar_identity');
  }finally{await client.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const identity=await bindDemoWallet({url:process.env.BAZAAR_MCP_URL??'https://bazaar.browns.studio/api/mcp',agentAccess:process.env.BAZAAR_AGENT_ACCESS??'',keypair:Keypair.fromSecret(process.env.BAZAAR_LOCAL_WALLET_SEED??'')});
    console.log(JSON.stringify({ownerId:identity.ownerId,agentId:identity.agentId,wallet:identity.wallet?.wallet,network:identity.network}));
  }catch{console.error('Wallet proof unconfirmed. Check local configuration and recover identity before retrying.');process.exitCode=1;}
}
