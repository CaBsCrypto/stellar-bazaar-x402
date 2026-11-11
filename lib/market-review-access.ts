const tokenPattern = /^[a-zA-Z0-9_-]{43}$/;
export function validMarketOperatorAccess(value: string) { return tokenPattern.test(value); }
/** A dedicated operator capsule never accepts a buyer/agent recovery document. */
export function parseMarketOperatorCapsule(raw: string, origin: string): string {
  if (new TextEncoder().encode(raw).byteLength > 4096) throw Error('INVALID_OPERATOR_CAPSULE');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'kind,origin,token,version') throw Error('INVALID_OPERATOR_CAPSULE');
  const capsule = value as Record<string, unknown>;
  if (capsule.kind !== 'bazaar-market-operator-access' || capsule.version !== 1 || capsule.origin !== origin || typeof capsule.token !== 'string' || !validMarketOperatorAccess(capsule.token)) throw Error('INVALID_OPERATOR_CAPSULE');
  return capsule.token;
}
/** Query credentials are rejected and scrubbed; only a private fragment is read. */
export function consumeMarketOperatorFragment(href: string) {
  const url = new URL(href), fragment = new URLSearchParams(url.hash.slice(1));
  const supplied = fragment.has('token') || url.searchParams.has('token');
  const token = fragment.getAll('token').length === 1 && !url.searchParams.has('token') ? fragment.get('token') ?? '' : '';
  fragment.delete('token'); url.searchParams.delete('token'); url.hash = fragment.toString();
  return {supplied, token: validMarketOperatorAccess(token) ? token : '', cleanPath: url.pathname + url.search + url.hash};
}
