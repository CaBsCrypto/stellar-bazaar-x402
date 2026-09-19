import type { ActivityEvent } from './activity';
export type RecoveryRecord = {recordedAt:string;payment:{status:string};delivery:{result?:unknown}};
export function recoverySummary(events: ActivityEvent[], record?: RecoveryRecord, available=false) {
 const ordered=[...events].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
 const hint=ordered.map(e=>e.result && typeof e.result==='object' ? (e.result as Record<string,any>).recoveryStatus : undefined).find(h=>h && ['pending','reported','verified-by-agent'].includes(h.payment) && ['pending-recovery','pending-storage'].includes(h.delivery));
 const hasContent=available || record?.delivery.result !== undefined;
 const payment=record?.payment.status==='not-requested' ? 'Sin pago' : hint?.payment==='verified-by-agent' ? 'Verificado por el agente' : record?.payment.status==='reported-unverified' || hint?.payment==='reported' ? 'Reportado · pendiente de verificación independiente' : 'Pendiente de confirmar';
 const delivery=hasContent ? 'Disponible' : hint?.delivery==='pending-storage' ? 'Pendiente de guardar' : hint?.delivery==='pending-recovery' ? 'Pendiente de recuperación' : 'Sin entrega disponible';
 const updated=[record?.recordedAt,...events.map(e=>e.recordedAt)].filter((v):v is string=>!!v).sort().at(-1);
 return {payment,delivery,updated,pending:!hasContent && !!hint};
}
