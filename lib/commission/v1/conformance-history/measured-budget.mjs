// Offline conservative sum. This is NOT the native admission authority or a billing reader.
export const REQUIRED_METRICS = Object.freeze(['identity-auth', 'capacity', 'order-cas', 'payment-auth',
  'rpc', 'ledger-proofs', 'delivery', 'buyer-history', 'seller-history', 'treasury-proof', 'recovery', 'maintenance']);
const BUCKETS = ['public', 'authenticated', 'recovery', 'background'];
const fail = reason => ({ version: 'bazaar.split-budget/v1', status: 'blocked', budgetSufficient: false,
  canAdmit: false, reason, requiresNativeAdmission: true });
const uint = value => Number.isSafeInteger(value) && value >= 0;
const fresh = (date, now, age) => Number.isSafeInteger(date) && date <= now && now - date <= age;

export function assessMeasuredBudget(input, { nowMs, maxAgeMs = 300000 } = {}) {
  if (!uint(nowMs) || !uint(maxAgeMs) || maxAgeMs === 0 || maxAgeMs > 300000) return fail('clock-required');
  const ledger = input?.ledger, physical = input?.provider;
  if (!ledger || !physical) return fail('current-ledger-and-provider-required');
  if (!fresh(ledger.measuredAt, nowMs, maxAgeMs) || !fresh(physical.measuredAt, nowMs, maxAgeMs)) return fail('stale-measurement');
  if (ledger.protectedHoldsExcluded !== true || !uint(ledger.availableBytes) ||
    !BUCKETS.every(key => uint(ledger.availableCommands?.[key]))) return fail('invalid-native-availability');
  if (physical.planChanged !== false || !uint(physical.remainingBytes) || !uint(physical.remainingCommands) ||
    typeof physical.measurementId !== 'string' || !physical.measurementId) return fail('invalid-provider-measurement');
  if (!Array.isArray(input.measurements) || input.measurements.length !== REQUIRED_METRICS.length) return fail('complete-measurements-required');
  const bytes = [], commands = Object.fromEntries(BUCKETS.map(key => [key, 0]));
  const found = new Set();
  for (const metric of input.measurements) {
    if (!REQUIRED_METRICS.includes(metric?.name) || found.has(metric.name)) return fail('invalid-or-duplicate-metric');
    if (metric.kind !== 'measured-upper-bound' || !fresh(metric.measuredAt, nowMs, maxAgeMs) ||
      typeof metric.evidenceId !== 'string' || !metric.evidenceId || typeof metric.inputDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(metric.inputDigest) || !uint(metric.bytesPerCall) || !uint(metric.commandsPerCall) ||
      !Number.isSafeInteger(metric.maxCalls) || metric.maxCalls < 1 || !BUCKETS.includes(metric.bucket)) return fail('unmeasured-metric');
    found.add(metric.name);
    const amount = metric.bytesPerCall * metric.maxCalls, count = metric.commandsPerCall * metric.maxCalls;
    if (!uint(amount) || !uint(count) || !uint(commands[metric.bucket] + count)) return fail('cost-overflow');
    bytes.push(amount); commands[metric.bucket] += count;
  }
  if (!uint(input.safetyBytes) || input.safetyBytes < 2097152) return fail('safety-margin-too-small');
  const requiredBytes = bytes.reduce((a, b) => a + b, input.safetyBytes);
  const requiredCommands = Object.values(commands).reduce((a, b) => a + b, 0);
  if (!uint(requiredBytes) || !uint(requiredCommands)) return fail('cost-overflow');
  const deficits = { nativeBytes: Math.max(0, requiredBytes - ledger.availableBytes),
    providerBytes: Math.max(0, requiredBytes - physical.remainingBytes),
    providerCommands: Math.max(0, requiredCommands - physical.remainingCommands),
    commandBuckets: Object.fromEntries(BUCKETS.map(key => [key, Math.max(0, commands[key] - ledger.availableCommands[key])])) };
  const sufficient = deficits.nativeBytes === 0 && deficits.providerBytes === 0 && deficits.providerCommands === 0 &&
    Object.values(deficits.commandBuckets).every(value => value === 0);
  return { version: 'bazaar.split-budget/v1', status: sufficient ? 'offline-model-fits' : 'blocked',
    budgetSufficient: sufficient, canAdmit: false, requiresNativeAdmission: true,
    reason: sufficient ? 'native-admission-capacity-quota-and-authorization-still-required' : 'insufficient-measured-budget',
    model: 'conservative-complete-sum-no-protected-reserve-release', requiredBytes, requiredCommands,
    commandBuckets: commands, deficits, evidenceIds: input.measurements.map(value => value.evidenceId) };
}
