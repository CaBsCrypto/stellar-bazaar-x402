import {publicBuyerConfiguration} from './public-buyer-admission.ts';
import {continuousFreeBudgetConfiguration} from './continuous-free-budget.ts';
import {textSellerConfiguration} from './market-text-seller-runtime.ts';
import {guardianCronConfiguration} from './demo-configuration.ts';
import {assertPerOrderStorageProfile} from './per-order-storage-profile.ts';
import {perOrderProductionPaymentsConfigured} from './per-order-production-payment.ts';
import {configuredMultisellerPolicy,assertMultisellerCredentials} from './multiseller-pilot.ts';
import {publicStarterProfile} from './public-registration-profile.ts';

type Environment=Readonly<Record<string,string|undefined>>;
/** A compiled contract revision, not a caller/env assertion about deployed
 * source. The final release digest belongs to separately reviewed build data. */
export const MARKET_RUNTIME_CONFIGURATION_REVISION='bazaar.runtime-native-config/v1' as const;
const failureCodes={
 productionRuntime:'CONFIG_PRODUCTION_RUNTIME_REQUIRED',
 expectedMarketplaceProfile:'CONFIG_EXPECTED_MARKETPLACE_PROFILE_REQUIRED',
 publicPolicyPresent:'CONFIG_PUBLIC_POLICY_REQUIRED',
 publicPolicyConfigured:'CONFIG_PUBLIC_POLICY_INVALID',
 enrollmentBudgetConfigured:'CONFIG_ENROLLMENT_BUDGET_INVALID',
 continuousBudgetConfigured:'CONFIG_CONTINUOUS_BUDGET_INVALID',
 textSellerConfigured:'CONFIG_TEXT_SELLER_INVALID',
 guardianConfigured:'CONFIG_GUARDIAN_INVALID',
 perOrderStorageConfigured:'CONFIG_PER_ORDER_STORAGE_INVALID',
 stellarTestnetAdaptersConfigured:'CONFIG_X402_STELLAR_TESTNET_INVALID',
 clockValid:'CONFIG_CLOCK_INVALID',
} as const;

/** Internal-only pure inspection. The HTTP boundary must pass its runtime env;
 * no HTTP/MCP input or project-env metadata may supply this argument. Native
 * functions consume existing runtime secrets here; no private values or hashes
 * leave the function. No store, transport or action capability is constructed. */
export function marketRuntimeConfigurationAttestation(environment:Environment,now=Date.now()){
 // Never let an invalid argument trigger a native function's default process.env.
 environment=environment&&typeof environment==='object'&&!Array.isArray(environment)?environment:{};
 const checks={productionRuntime:false,expectedMarketplaceProfile:false,publicPolicyPresent:false,publicPolicyConfigured:false,enrollmentBudgetConfigured:false,continuousBudgetConfigured:false,textSellerConfigured:false,guardianConfigured:false,perOrderStorageConfigured:false,stellarTestnetAdaptersConfigured:false,clockValid:Number.isSafeInteger(now)&&now>=0};
 let publicAdmissionOpen=false,configurationId:string|null=null,admissionPolicyVersion:1|2|null=null,configuredSellerCount=0,enrollmentBudgetProfile:'starter-v1'|'legacy'|'unavailable'='unavailable';
 try{
  checks.productionRuntime=environment.NODE_ENV==='production'&&environment.VERCEL==='1'&&environment.VERCEL_ENV==='production';
  checks.expectedMarketplaceProfile=environment.BAZAAR_FREE_DEMO_MODE==='continuous'&&environment.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE==='compact-registry-v2'&&environment.BAZAAR_MARKET_ORDER_STORAGE==='per-order-v1'&&environment.BAZAAR_PER_ORDER_X402_MODE==='stellar-testnet-v1'&&environment.BAZAAR_PER_ORDER_PROVIDER_PROTOCOL==='bazaar.per-order-provider/v1';
  checks.publicPolicyPresent=typeof environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON==='string';
 }catch{/* Never retain an exception message or an environment value. */}
 try{
  const policy=publicBuyerConfiguration(environment,now);
  checks.publicPolicyConfigured=checks.publicPolicyPresent&&policy.configured&&policy.policy!==undefined&&policy.policy.mode==='public-budgeted';
  publicAdmissionOpen=checks.publicPolicyConfigured&&checks.clockValid&&policy.admissionOpen;
  if(checks.publicPolicyConfigured&&policy.policy){admissionPolicyVersion=policy.policy.version;configuredSellerCount=policy.policy.version===2?policy.policy.sellers.length:1;}
 }catch{/* Native configuration failures have fixed public reason codes. */}
 try{const starter=publicStarterProfile(environment);enrollmentBudgetProfile=starter?'starter-v1':'legacy';checks.enrollmentBudgetConfigured=true;}catch{}
 try{
  const budget=continuousFreeBudgetConfiguration(environment);
  checks.continuousBudgetConfigured=budget!==undefined&&budget.mode==='continuous'&&[9900000000,9950000000].includes(budget.transferBytes)&&/^[a-f0-9]{64}$/.test(budget.configurationId);
  if(checks.continuousBudgetConfigured&&budget)configurationId=budget.configurationId;
 }catch{/* No ledger is opened by the pure configuration function. */}
 try{const policy=configuredMultisellerPolicy(environment);if(policy){assertMultisellerCredentials(policy,environment);checks.textSellerConfigured=true;}else checks.textSellerConfigured=textSellerConfiguration(environment)!==undefined;}catch{}
 try{const guardian=guardianCronConfiguration(environment);checks.guardianConfigured=guardian.credentialConfigured&&guardian.operatorHashMatches&&guardian.productionDeployment;}catch{}
 try{checks.perOrderStorageConfigured=assertPerOrderStorageProfile(environment)==='continuous';}catch{}
 try{checks.stellarTestnetAdaptersConfigured=perOrderProductionPaymentsConfigured(environment);}catch{}
 const configured=Object.values(checks).every(value=>value===true);
 return {
  revision:MARKET_RUNTIME_CONFIGURATION_REVISION,
  status:configured?'CONFIGURED' as const:'INCOMPLETE' as const,
  configured,
  checks,
  publicAdmissionOpen,
  admissionPolicyVersion,
  configuredSellerCount,
  enrollmentBudget:{profile:enrollmentBudgetProfile,maximumNewOwners:enrollmentBudgetProfile==='starter-v1'?3:null,futureControlCapacityPromised:false as const,completeFinancialLifecycleCertified:false as const},
  profiles:{admission:checks.publicPolicyConfigured?'public-budgeted' as const:'unavailable' as const,budget:checks.continuousBudgetConfigured?'continuous' as const:'unavailable' as const,transport:checks.expectedMarketplaceProfile?'compact-registry-v2' as const:'unavailable' as const,storage:checks.perOrderStorageConfigured?'per-order-v1' as const:'unavailable' as const,network:checks.stellarTestnetAdaptersConfigured?'stellar:testnet' as const:'unavailable' as const,x402:checks.stellarTestnetAdaptersConfigured?'stellar-testnet-v1' as const:'unavailable' as const},
  configurationId,
  reasonCodes:(Object.keys(failureCodes) as (keyof typeof failureCodes)[]).filter(key=>!checks[key]).map(key=>failureCodes[key]),
  sellerReadinessVerified:false as const,
  budgetAvailabilityVerified:false as const,
  admissionCapacityVerified:false as const,
  livePaymentsVerified:false as const,
  privateHistoryVerified:false as const,
  readyForNativeAction:false as const,
 };
}
