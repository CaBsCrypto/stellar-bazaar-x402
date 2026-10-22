/** Canonical application/Redis JSON bounds, never a physical usage measurement.
 * Every raw writer cap,6x JSON escape, script and framing allowance is retained.
 * Round UP to64KiB so enforced scopes share the same derived integer ceilings.
 */
const KiB=1024;
export const READ_ARGUMENT_BOUNDS=Object.freeze({
 ingressCasRawBytes:32768+32768+512+512+64+4096,
 ownerQuotaCasRawBytes:32768+131072+32768+512+512+64+4096,
 remainingArgumentsRawBytes:32768,
 allScriptBytes:96*KiB,
 protocolAndKeysBytes:64*KiB,
 maximumJsonEscape:6,
});
const b=READ_ARGUMENT_BOUNDS;
export const READ_MAXIMUM_OUTBOUND_BYTES=b.maximumJsonEscape*(b.ingressCasRawBytes+b.ownerQuotaCasRawBytes+b.remainingArgumentsRawBytes)+b.allScriptBytes+b.protocolAndKeysBytes;
export const READ_MAXIMUM_INBOUND_BYTES=Object.freeze({context:2036736,terms:2036736,history:3866624});
export const SPLIT_READ_WIRE_ROUNDING_BYTES=64*KiB;
const round=bytes=>Math.ceil(bytes/SPLIT_READ_WIRE_ROUNDING_BYTES)*SPLIT_READ_WIRE_ROUNDING_BYTES;
export const SPLIT_READ_REDIS_WIRE_BYTES=Object.freeze(Object.fromEntries(Object.entries(READ_MAXIMUM_INBOUND_BYTES).map(([action,inbound])=>[action,round(READ_MAXIMUM_OUTBOUND_BYTES+inbound)])));
