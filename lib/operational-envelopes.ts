import type { OperationalProfile } from './operational-pressure.ts';
export const OPERATIONAL_TRANSPORT_ENVELOPES = {
  // Two budget exchanges plus catalog's three snapshots; discovery additionally reads index/cards.
  public: { redis: 7, commandsUpperBound: 12, outboundPayloadBytes: 192 * 1024, inboundPayloadBytes: 6 * 1048576, dtoBytes: 128 * 1024, externalRequests: 0, externalOutboundBytes: 0, externalInboundBytes: 0 },
  // Signed first request: 9 capacity commits x 4 REST + 4 reads + auth(1 + 8 x 2)
  // + three budget GET/CAS pairs = 63. Two uncertainty commits add <=8: reserve 72.
  // Each capacity commit includes its GET, two companion GETs and the multi-key CAS.
  // Escaped capacity CAS <=3 MiB out/1.5 MiB in; eight quota CAS <=36 MiB out,
  // auth snapshots <=22.5 MiB in. Eleven commits + reads/budgets fit 72/44 MiB.
  authenticated: { redis: 72, commandsUpperBound: 330, outboundPayloadBytes: 72 * 1048576, inboundPayloadBytes: 44 * 1048576, dtoBytes: 128 * 1024, externalRequests: 3, externalOutboundBytes: 256 * 1024, externalInboundBytes: 512 * 1024 },
  // Reconcile can perform 3 finalization commits + 2 uncertainty commits, 3 reads,
  // auth(1 + 8 x 2) and one budget pair: <=42 REST; reserve 44. No re-settlement.
  recovery: { redis: 44, commandsUpperBound: 330, outboundPayloadBytes: 52 * 1048576, inboundPayloadBytes: 34 * 1048576, dtoBytes: 128 * 1024, externalRequests: 8, externalOutboundBytes: 576 * 1024, externalInboundBytes: 1024 * 1024 },
} as const;
export const OPERATIONAL_METADATA_ENVELOPE={redis:2,commandsUpperBound:4,outboundPayloadBytes:192*1024,inboundPayloadBytes:64*1024,dtoBytes:128*1024,externalRequests:0,externalOutboundBytes:0,externalInboundBytes:0} as const;
export function operationalTransportEnvelope(profile: OperationalProfile, workload?:'metadata') { return profile==='public'&&workload==='metadata'?OPERATIONAL_METADATA_ENVELOPE:OPERATIONAL_TRANSPORT_ENVELOPES[profile]; }
