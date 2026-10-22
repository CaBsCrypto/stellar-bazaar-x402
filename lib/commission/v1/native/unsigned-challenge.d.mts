import type {PreparationPorts,PreparationPolicy,VerifiedContractContext} from './contract-context.mjs';
export interface UnsignedChallengePolicy extends PreparationPolicy {payer:string;provider:string;treasury:string;asset:string;grossAtomic:string;sellerNetAtomic:string;feeAtomic:string;feeBps:number}
export interface UnsignedChallengePacket {readonly func:string;readonly auth:readonly[string]}
export function validateUnsignedAuthorization(policy:UnsignedChallengePolicy,encoded:string,context:{currentLedger:number}):string;
export function createUnsignedChallengePreparer(options:PreparationPorts&{sourceAccountForBinding:(input:{capability:object;policy:UnsignedChallengePolicy})=>Promise<{accountId:string;policyHash:string;sourceDigest:string}>}):(input:{capability:object;policy:UnsignedChallengePolicy;context:VerifiedContractContext})=>Promise<UnsignedChallengePacket>;
