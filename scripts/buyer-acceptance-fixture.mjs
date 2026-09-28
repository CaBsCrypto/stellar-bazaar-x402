import { Keypair } from '@stellar/stellar-sdk';
import { sandboxOptions } from '../lib/payment-options.ts';
// Public deterministic identities for in-process simulation only; never fund these accounts.
export function buyerAcceptanceCard() {
 const seller=Keypair.fromRawEd25519Seed(Buffer.alloc(32,72)).publicKey();
 return {version:'bazaar.service-card/v0',id:'swap-risk-quote',name:'Synthetic sandbox',description:'Isolated deterministic simulation.',kind:'http',url:'https://localhost:3215',routeTemplate:'/api/x402/swap-risk?pair={pair}&amount={amount}&side={side}',input:['pair','amount','side'].map(name=>({name,type:name==='amount'?'number':'string',required:true})),network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:seller},paymentOptions:sandboxOptions(seller),provider:{name:'Synthetic'},tags:['sandbox']};
}
