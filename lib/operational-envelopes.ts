import type { OperationalProfile,OperationalWorkload } from './operational-pressure.ts';
export const OPERATIONAL_TRANSPORT_ENVELOPES = {
  // Native discovery also consumes ingress (up to eight definite CAS conflicts),
  // and authenticated query observation adds quota/identity/history writes.
  public: { redis: 44, commandsUpperBound: 240, outboundPayloadBytes: 80 * 1048576, inboundPayloadBytes: 54 * 1048576, dtoBytes: 128 * 1024, externalRequests: 0, externalOutboundBytes: 0, externalInboundBytes: 0 },
  // The signed first request includes a challenge, repeated buyer/seller registry
  // guards, joint settlement commits, three budget GET/CAS pairs, and independent
  // ingress/account quotas (each up to eight READ/CAS attempts). The native offline
  // fixture reaches 96 REST before any uncertainty writes; reserve two further
  // completion commits (8 REST) and explicit headroom. Lua internals are counted.
  // This is a worst-case reservation: ingress alone can JSON-wrap 32 MiB out/16
  // MiB in. It is not the observed transaction payload or a provider billing unit.
  authenticated: { redis: 112, commandsUpperBound: 440, outboundPayloadBytes: 112 * 1048576, inboundPayloadBytes: 64 * 1048576, dtoBytes: 128 * 1024, externalRequests: 3, externalOutboundBytes: 256 * 1024, externalInboundBytes: 512 * 1024 },
  // Existing-operation reconciliation preserves the previous payment allowance
  // plus independent public-demo ingress (16 REST/88 Lua command upper bound).
  // No re-settlement. The native full ingress fixture reaches 50 REST.
  recovery: { redis: 64, commandsUpperBound: 420, outboundPayloadBytes: 84 * 1048576, inboundPayloadBytes: 52 * 1048576, dtoBytes: 128 * 1024, externalRequests: 8, externalOutboundBytes: 576 * 1024, externalInboundBytes: 1024 * 1024 },
} as const;
// Bounds describe reservations, not measured consumption or provider billing.
// The 1-MiB registry can occur in sixteen successful/definite-conflict ingress
// transports; JSON wrapping can double it. The budget GET/CAS adds two more.
export const OPERATIONAL_METADATA_ENVELOPE={redis:18,commandsUpperBound:92,outboundPayloadBytes:34*1048576,inboundPayloadBytes:18*1048576,dtoBytes:128*1024,externalRequests:0,externalOutboundBytes:0,externalInboundBytes:0} as const;
export const OPERATIONAL_CONTROL_ENVELOPES={
  // Ingress16 + resolve1 + quota16 + identity1 + budget2. Quota includes the
  // 128-KiB owner snapshot; every possible Lua call is counted, not just SETs.
  identity:{redis:36,commandsUpperBound:196,outboundPayloadBytes:68*1048576,inboundPayloadBytes:40*1048576,dtoBytes:128*1024,externalRequests:0,externalOutboundBytes:0,externalInboundBytes:0},
  // Same auth/quotas; one 512-KiB market snapshot, bounded page <=20/128KiB.
  orders:{redis:36,commandsUpperBound:196,outboundPayloadBytes:68*1048576,inboundPayloadBytes:40*1048576,dtoBytes:128*1024,externalRequests:0,externalOutboundBytes:0,externalInboundBytes:0},
  // Adds owner guard, review, two market reads and companion GETs + joint CAS.
  // The CAS includes the full 1-MiB registry guard and completion reservations.
  capacity:{redis:42,commandsUpperBound:212,outboundPayloadBytes:76*1048576,inboundPayloadBytes:48*1048576,dtoBytes:128*1024,externalRequests:0,externalOutboundBytes:0,externalInboundBytes:0},
  // Query observer: auth/quotas, wallet, optional restricted-cohort identity,
  // and one READ/CAS to conserve the bounded query result fingerprint.
  'observed-metadata':{redis:40,commandsUpperBound:212,outboundPayloadBytes:76*1048576,inboundPayloadBytes:48*1048576,dtoBytes:128*1024,externalRequests:0,externalOutboundBytes:0,externalInboundBytes:0},
} as const;
export function operationalTransportEnvelope(profile: OperationalProfile, workload?:OperationalWorkload) {
 if(profile==='public'&&workload==='metadata')return OPERATIONAL_METADATA_ENVELOPE;
 if(profile==='public'&&workload==='observed-metadata')return OPERATIONAL_CONTROL_ENVELOPES['observed-metadata'];
 if(profile==='recovery'&&(workload==='identity'||workload==='orders'))return OPERATIONAL_CONTROL_ENVELOPES[workload];
 if(profile==='authenticated'&&workload==='capacity')return OPERATIONAL_CONTROL_ENVELOPES.capacity;
 return OPERATIONAL_TRANSPORT_ENVELOPES[profile];
}
