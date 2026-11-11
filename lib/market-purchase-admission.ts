import {externalBuyerPilotConfiguration} from './external-buyer-pilot.ts';
import {publicBuyerConfiguration} from './public-buyer-admission.ts';
type Environment = Readonly<Record<string, string | undefined>>;

/** Admission cohorts use internal account IDs, never wallet addresses or tokens.
 * An absent policy preserves public admission; malformed policies fail closed.
 * Only the effective mode/permission may leave this module, never its members.
 */
export function purchaseAdmissionConfiguration(environment: Environment = process.env, buyerOwnerId?: string, now=Date.now()) {
  if(environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON!==undefined){const c=publicBuyerConfiguration(environment,now);return {mode:'public-budgeted' as const,configured:c.configured,allowed:c.admissionOpen};}
  const raw = environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON;
  if (raw === undefined) return environment.BAZAAR_EXTERNAL_BUYER_PILOT_JSON===undefined?{ mode: 'public' as const, configured: true, allowed: true }:{mode:'restricted' as const,configured:false,allowed:false};
  try {
    if (Buffer.byteLength(raw) > 4096) throw Error();
    const owners: unknown = JSON.parse(raw);
    if (!Array.isArray(owners) || owners.length > 100 || owners.some(v => typeof v !== 'string' || !/^ow_[a-f0-9]{32}$/.test(v)) || new Set(owners).size !== owners.length) throw Error();
    if (owners.length === 0) return environment.BAZAAR_EXTERNAL_BUYER_PILOT_JSON===undefined?{ mode: 'public' as const, configured: true, allowed: true }:{mode:'restricted' as const,configured:false,allowed:false};
    if(typeof buyerOwnerId==='string'&&owners.includes(buyerOwnerId))return {mode:'restricted' as const,configured:true,allowed:true};
    const external=externalBuyerPilotConfiguration(environment,now);
    return { mode: 'restricted' as const, configured: external.configured, allowed: external.admissionOpen&&!!external.policy?.buyers.some(b=>b.ownerId===buyerOwnerId) };
  } catch {
    return { mode: 'restricted' as const, configured: false, allowed: false };
  }
}
