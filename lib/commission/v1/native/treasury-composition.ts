import {Redis} from '@upstash/redis';
import {meteredRedis} from '../../../acceptance-meter.ts';
import {configuredWorkspaceStore,workspacePrefix} from '../../../workspace-store.ts';
import {marketPrefix} from '../../../marketplace-store.ts';
import {prepareContinuousStorageCommit} from '../../../continuous-free-storage.ts';
import type {WorkspacePrincipal} from '../../../workspace-types.ts';
import {marketDiagnosticOperatorMatches} from '../../../market-operator-diagnostic-origin.ts';
import {createTreasuryBindingStore} from './treasury-binding.mjs';
import {createTreasuryAccountReader} from './treasury-account-reader.mjs';

/** Lazy metadata-only factory. There is no order store, ledger/checkpoint
 * ingestion, history key, provider authority, transaction signer or dispatcher.
 * Native current HUMAN identity/wallet and its exact registry guard supply
 * ownership. The prior local receipt is evidence, never production authority. */
export function configuredNativeTreasuryComponents(){
 if(process.env.BAZAAR_WORKSPACE_BACKEND!=='redis'||process.env.BAZAAR_FREE_DEMO_MODE!=='continuous'||process.env.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE!=='compact-registry-v2')throw Error('TREASURY_BINDING_RUNTIME_UNAVAILABLE');
 const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;if(!url||!token)throw Error('TREASURY_BINDING_REDIS_UNAVAILABLE');const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('TREASURY_BINDING_REDIS_UNAVAILABLE');
 const redis=meteredRedis(new Redis({url,token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false})),mp=marketPrefix(),wp=workspacePrefix();if(mp.replace('bazaar-market:','bazaar-workspace:')!==wp)throw Error('TREASURY_BINDING_NAMESPACE_INVALID');
 const readChainEvidence=createTreasuryAccountReader({enabled:process.env.BAZAAR_TREASURY_CHAIN_READS_ENABLED==='true',fetcher:fetch});
 const store=createTreasuryBindingStore({redis,marketPrefix:mp,workspacePrefix:wp,workspaceSnapshot:(principal:WorkspacePrincipal)=>configuredWorkspaceStore().walletIdentity(principal),storagePlan:(writes:Parameters<typeof prepareContinuousStorageCommit>[2])=>prepareContinuousStorageCommit(redis,wp,writes),readChainEvidence,operatorMatches:(request:Request)=>marketDiagnosticOperatorMatches(request)});
 return {store};
}
