export const PROFILE = 'bazaar-split-exact-v1';
export const ASSET = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const TREASURY = 'GATWLYZ5KF4H4YEPBINI6DARECUCI5CIN5ZEOF7YN7XYJ22Z5TLRXZ2X';
export const NAMESPACE = 'bazaar:split:v1:orders';

// This is an offline candidate, never an advertisement of operational support.
export function candidateManifest() {
  return {
    version: 'bazaar.payment-discovery/v1',
    profile: PROFILE,
    status: 'local-candidate',
    enabled: false,
    published: false,
    standardExactCompatible: false,
    network: 'stellar:testnet',
    asset: ASSET,
    decimals: 7,
    fee: { bps: 150, includedInGross: true, treasury: TREASURY, rounding: 'reject' },
    allocation: { grossAtomic: '100000', sellerNetAtomic: '98500', commissionAtomic: '1500' },
    storage: { namespace: NAMESPACE, orderVersion: 'bazaar.split-order/v1', legacyMigration: false },
    capabilities: { discover: 'offline-fixture', order: false, sign: false, settle: false, history: 'offline-owner-scoped-fixture' },
    activationRequires: ['reviewed-contract-wasm', 'testnet-contract-deployment-authorization',
      'seller-net-acceptance', 'treasury-control-and-usdc-eligibility', 'channels-compatibility-and-fee-limit',
      'reviewed-server-integration', 'current-complete-budget', 'buyer-quota', 'seller-capacity',
      'coordinated-publication-authorization', 'specific-pilot-authorization'],
  };
}
