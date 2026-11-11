import {WorkspaceError} from './workspace-types.ts';
import type {MarketOrder} from './marketplace-store.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';

/** Accounting opt-in for the single uncreated zero-fee pilot. No authorization,
 * transport or wallet capability is created here. Generic clients keep v1.
 * No polling or manual seller actions are in this finite execution plan. One
 * challenge, submission, two order reads and two delivery attempts are
 * funded; the second order read is Carmelita's one-use recovery, not a new
 * payment or automatic polling. A separate reconciliation POST is outside this
 * plan. Uncertainty stops the client. Histories use separate global room. */
export const FINITE_PILOT_ID='ed6c4530-e76f-49e0-8f39-5ec8578820e2';
export const FINITE_PILOT_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:2264,transferBytes:32251904,globalAllowanceBytes:9863168,finitePilot:true as const,optimizedAdmissionForecast:true as const});
export const FINITE_WORKSPACE_COMMANDS=64;
export function finitePilotProfile(){
 const v=process.env.BAZAAR_FINITE_PILOT_TRANSPORT;if(v===undefined)return false;
 if(v!=='single-flight-v1'||process.env.BAZAAR_PILOT_REVIEW_TRANSPORT!=='bounded-v1'||process.env.BAZAAR_PILOT_MAINTENANCE_TRANSPORT!=='workspace-v1'||process.env.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE!=='compact-registry-v2'||process.env.BAZAAR_FREE_DEMO_MODE!=='continuous'||process.env.BAZAAR_MARKET_ORDER_STORAGE!=='per-order-v1')throw new WorkspaceError('FINITE_PILOT_PROFILE_UNAVAILABLE',503);
 return true;
}
export function finitePilotReservation(order:MarketOrder|undefined){
 if(!finitePilotProfile()||order?.operationId!==FINITE_PILOT_ID)return undefined;
 const input=order.input;
 if(order.buyerOwnerId!=='ow_b8287c90f5bc4c818451b501ee55bd7d'||order.serviceId!=='guionista-bazaar-production-text-v1'||order.cardHash!=='fa0890b56563deb08a983fb6e75d020a6105babc0b4bd3a6b834f4468897cefc'||order.payer!=='GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ'||order.destination!=='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C'||order.amount!=='0.01'||order.paymentProtocol!=='x402-stellar-exact-v2'||!isCanonicalUsdcTestnet(order.settlement)||order.inputHash!=='7b976102d720675644bfe2a5ae2768afd59d5399f9965fc88067af259898bce1'||!input||Object.keys(input).sort().join(',')!=='durationSeconds,tone,topic'||input.topic!=='Validar el flujo de un agente que compra un servicio en Bazaar'||input.tone!=='claro'||input.durationSeconds!==15)throw new WorkspaceError('FINITE_PILOT_BINDING_MISMATCH',503);
 return FINITE_PILOT_RESERVATION;
}
