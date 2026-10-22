import manifest from '../public/payment-profiles/bazaar-split-exact-v1.json';

export const SPLIT_PROFILE_RESOURCE_URI = 'bazaar://payment-profiles/bazaar-split-exact-v1' as const;
export const SPLIT_PROFILE_DOCUMENT_PATH = '/payment-profiles/bazaar-split-exact-v1.json' as const;

/** Static preview only. No environment value can enable payment dispatch here. */
export function splitProfilePublication() {
  return structuredClone(manifest);
}
