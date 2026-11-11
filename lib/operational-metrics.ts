import type { Counts } from './acceptance-meter.ts';

/** Numeric infrastructure evidence only; no URLs, arguments, tokens, keys, or record contents. */
export function operationalMetricTotals(counts: Counts, requests = 1) {
  return { requests, redisRequests: counts.redis, redisCommandsUpperBound: counts.commandsUpperBound,
    redisOutboundPayloadBytes: counts.outboundPayloadBytes, redisInboundPayloadBytes: counts.inboundPayloadBytes,
    externalRequests: Object.values(counts.external).reduce((total, count) => total + (count ?? 0), 0),
    externalOutboundPayloadBytes: counts.externalOutboundPayloadBytes, externalInboundPayloadBytes: counts.externalInboundPayloadBytes,
    uncertain: counts.uncertain };
}
