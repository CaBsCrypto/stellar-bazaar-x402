import {Keypair, StrKey} from '@stellar/stellar-sdk';
import {z} from 'zod';
import {WorkspaceError} from './workspace-types.ts';

export const demoEnabled = () => process.env.BAZAAR_PUBLIC_DEMO === 'true';
export const walletAddressSchema = z.string().refine(v => StrKey.isValidEd25519PublicKey(v), 'Ed25519 public wallet required');
export const walletChallengeSchema = z.object({challengeId:z.string().uuid(),ownerId:z.string(),agentId:z.string(),generation:z.number().int().positive(),wallet:walletAddressSchema,origin:z.string().url(),network:z.literal('stellar:testnet'),nonce:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.number().int().positive()}).strict();
export type WalletChallenge = z.infer<typeof walletChallengeSchema>;
export const walletBindingSchema = z.object({wallet:walletAddressSchema,network:z.literal('stellar:testnet'),verifiedAt:z.string().datetime(),challengeId:z.string().uuid()}).strict();
export const walletChallengeInput = z.object({wallet:walletAddressSchema}).strict();
export const walletProofInput = z.object({challengeId:z.string().uuid(),signature:z.string().regex(/^[A-Za-z0-9+/]{86}==$/)}).strict();
export function walletMessage(challenge:WalletChallenge):string {
  return JSON.stringify({purpose:'bazaar-wallet-binding/v1',...walletChallengeSchema.parse(challenge)});
}
export function verifyWalletProof(challenge:WalletChallenge,signature:string) {
  const parsed=walletProofInput.safeParse({challengeId:challenge.challengeId,signature});
  if(!parsed.success || !Keypair.fromPublicKey(challenge.wallet).verify(Buffer.from(walletMessage(challenge),'utf8'),Buffer.from(signature,'base64'))) throw new WorkspaceError('WALLET_SIGNATURE_INVALID',403);
}
export type WalletAccount = {account_id:string; thresholds:{low_threshold:number;med_threshold:number;high_threshold:number};signers:{key:string;type:string;weight:number}[]};
export function assertSingleSigner(account:WalletAccount,wallet:string) {
  if(!account||!Array.isArray(account.signers)||!account.thresholds||['low_threshold','med_threshold','high_threshold'].some(key=>!Number.isInteger(account.thresholds[key as keyof WalletAccount['thresholds']])))throw new WorkspaceError('WALLET_NETWORK_UNAVAILABLE');
  const signers=account.signers.filter(s=>s.weight>0);
  if(account.account_id!==wallet || signers.length!==1 || signers[0].key!==wallet || signers[0].type!=='ed25519_public_key' || !Number.isInteger(signers[0].weight) || signers[0].weight<1 || Object.values(account.thresholds).some(t=>!Number.isInteger(t)||t<0||t>signers[0].weight)) throw new WorkspaceError('WALLET_SINGLE_SIGNER_REQUIRED',403);
}
export async function readTestnetWalletAccount(wallet:string):Promise<WalletAccount> {
  try {
    const response=await fetch(`https://horizon-testnet.stellar.org/accounts/${walletAddressSchema.parse(wallet)}`,{signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});
    if(response.status===404)throw new WorkspaceError('WALLET_TESTNET_ACCOUNT_REQUIRED',409);
    if(!response.ok)throw new WorkspaceError('WALLET_NETWORK_UNAVAILABLE');
    const reader=response.body?.getReader();if(!reader)throw new WorkspaceError('WALLET_NETWORK_UNAVAILABLE');
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new WorkspaceError('WALLET_NETWORK_UNAVAILABLE');}chunks.push(value);}
    const raw=Buffer.concat(chunks).toString('utf8');
    return JSON.parse(raw);
  }catch(e){if(e instanceof WorkspaceError)throw e;throw new WorkspaceError('WALLET_NETWORK_UNAVAILABLE');}
}
