import type {SplitPolicy} from '../policy-router/fee-split-policy-v1.mjs';
import type {SignedRouterPacket} from '../channels-adapter/adapter.mjs';
import type {NativeAdapterAuthorization,NativeAdapterCapability,NativeAdapterOrder} from './adapters-authorization.mjs';
import type {VerifiedContractContext} from './contract-context.mjs';
import type {UnsignedChallengePacket} from './unsigned-challenge.mjs';
import type {createRedisSplitJournal} from '../channels-adapter/redis-journal.mjs';
import type {createTestnetRpcReader} from '../rpc-reader/reader.mjs';
export function createManagedChannelsFinancialAuthority():{readiness():Promise<{ready:false;evidenceMode:'production-disabled';enforcedBeforeDispatch:false;maximumFeeStroops:string;blockers:string[]}>;authorize():Promise<never>};
export function createNativeSplitDependencyFactories(options:{redis:{get(key:string):Promise<unknown>;eval(script:string,keys:string[],args:string[]):Promise<unknown>};namespace:string;adapterAuthorization?:NativeAdapterAuthorization;fetcher?:typeof fetch;now?:()=>number}):{
 financialAuthority:ReturnType<typeof createManagedChannelsFinancialAuthority>;
 journal(input?:{capability:NativeAdapterCapability}):ReturnType<typeof createRedisSplitJournal>;
 rpcForOrder(input:{capability:NativeAdapterCapability;order:NativeAdapterOrder;packet:SignedRouterPacket;transactionHash?:string|null}):Promise<{transaction:ReturnType<typeof createTestnetRpcReader>['transaction']}>;
 context(input?:{capability:NativeAdapterCapability;policy?:SplitPolicy;order?:NativeAdapterOrder}):Promise<VerifiedContractContext>;
 prepareChallenge(policy:SplitPolicy,binding?:{capability:NativeAdapterCapability}):Promise<UnsignedChallengePacket>;
 transport():{submitSorobanTransaction(...args:unknown[]):Promise<never>};
 readiness():{productionFinancialReady:false;writeReady:false;journalReadAvailable:boolean;rpcBudgetAdapterConfigured:boolean;routerContextAdapterConfigured:boolean;challengeAdapterConfigured:boolean;providerFeeBoundEnforced:false};
};
