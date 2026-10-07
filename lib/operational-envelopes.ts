import type { OperationalProfile } from './operational-pressure.ts';
export const OPERATIONAL_TRANSPORT_ENVELOPES = {
  // Two budget exchanges plus catalog's three snapshots; discovery additionally reads index/cards.
  public: { redis: 7, commandsUpperBound: 12, outboundPayloadBytes: 192 * 1024, inboundPayloadBytes: 6 * 1048576, dtoBytes: 128 * 1024, externalRequests: 0, externalOutboundBytes: 0, externalInboundBytes: 0 },
  authenticated: { redis: 34, commandsUpperBound: 330, outboundPayloadBytes: 9 * 1048576, inboundPayloadBytes: 17 * 1048576, dtoBytes: 128 * 1024, externalRequests: 3, externalOutboundBytes: 256 * 1024, externalInboundBytes: 512 * 1024 },
  // Full capacity CAS + workspace quota retries remain bounded; recovery never re-settles payment.
  recovery: { redis: 34, commandsUpperBound: 330, outboundPayloadBytes: 9 * 1048576, inboundPayloadBytes: 17 * 1048576, dtoBytes: 128 * 1024, externalRequests: 8, externalOutboundBytes: 256 * 1024, externalInboundBytes: 1024 * 1024 },
} as const;
export const OPERATIONAL_METADATA_ENVELOPE={redis:2,commandsUpperBound:4,outboundPayloadBytes:192*1024,inboundPayloadBytes:64*1024,dtoBytes:128*1024,externalRequests:0,externalOutboundBytes:0,externalInboundBytes:0} as const;
export function operationalTransportEnvelope(profile: OperationalProfile, workload?:'metadata') { return profile==='public'&&workload==='metadata'?OPERATIONAL_METADATA_ENVELOPE:OPERATIONAL_TRANSPORT_ENVELOPES[profile]; }
