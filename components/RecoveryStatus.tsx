import type {ActivityEvent} from '@/lib/activity';
import type {RecoveryRecord} from '@/lib/recovery-summary';
import {recoverySummary} from '@/lib/recovery-summary';
export function RecoveryStatus({events,record,available=false}:{events:ActivityEvent[];record?:RecoveryRecord;available?:boolean}) {
 const state=recoverySummary(events,record,available);
 return <section aria-label="Estado del pago y la entrega" className="recovery-status">
  <dl><div><dt>Pago</dt><dd>{state.payment}</dd></div><div><dt>Entrega</dt><dd>{state.delivery}</dd></div><div><dt>Última actualización recibida</dt><dd>{state.updated ? <time dateTime={state.updated}>{new Date(state.updated).toLocaleString()}</time> : 'Sin actualizaciones recibidas'}</dd></div></dl>
  {state.pending && <p>{state.delivery==='Pendiente de guardar' ? 'La respuesta se conserva en el cliente. Falta registrarla en la biblioteca.' : 'Se está intentando recuperar la entrega. Este estado no confirma ni descarta el cobro.'} La recuperación no inicia otro pago.</p>}
 </section>;
}
