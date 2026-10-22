type Environment = Readonly<Record<string, string | undefined>>;

/** Admission cohorts use internal account IDs, never wallet addresses or tokens.
 * An absent policy preserves public admission; malformed policies fail closed.
 * Only the effective mode/permission may leave this module, never its members.
 */
export function purchaseAdmissionConfiguration(environment: Environment = process.env, buyerOwnerId?: string) {
  const raw = environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON;
  if (raw === undefined) return { mode: 'public' as const, configured: true, allowed: true };
  try {
    if (Buffer.byteLength(raw) > 4096) throw Error();
    const owners: unknown = JSON.parse(raw);
    if (!Array.isArray(owners) || owners.length > 100 || owners.some(v => typeof v !== 'string' || !/^ow_[a-f0-9]{32}$/.test(v)) || new Set(owners).size !== owners.length) throw Error();
    if (owners.length === 0) return { mode: 'public' as const, configured: true, allowed: true };
    return { mode: 'restricted' as const, configured: true, allowed: typeof buyerOwnerId === 'string' && owners.includes(buyerOwnerId) };
  } catch {
    return { mode: 'restricted' as const, configured: false, allowed: false };
  }
}
