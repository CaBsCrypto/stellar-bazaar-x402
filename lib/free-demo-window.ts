type Environment = Readonly<Record<string, string | undefined>>;

/** Optional bounded demo admission. Expiry closes fresh work, never recovery.
 * The UTC deadline is public configuration; no account or credential is read.
 */
export function freeDemoWindow(environment: Environment = process.env, now = Date.now()) {
  const until = environment.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;
  if (until === undefined) return { enabled: false, configured: true, admissionOpen: true, expiresAt: null };
  const configured = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(until) &&
    Number.isSafeInteger(Date.parse(until)) && new Date(until).toISOString() === until &&
    Number.isSafeInteger(now) && now >= 0;
  return { enabled: true, configured, admissionOpen: configured && now < Date.parse(until), expiresAt: configured ? until : null };
}
