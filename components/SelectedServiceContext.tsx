import { selectedServiceId, serviceSelectionHref } from '@/lib/service-selection';

export function SelectedServiceContext({ serviceId, connect = false }: { serviceId?: string; connect?: boolean }) {
  const id = selectedServiceId(serviceId);
  if (!id) return null;
  return <aside className='ui-card' aria-label='Servicio elegido'>
    <p><strong>Servicio elegido:</strong> <a href={`/resources/${encodeURIComponent(id)}`}>{id}</a></p>
    <p>Tu agente comprobará las condiciones y disponibilidad actuales y pedirá tu autorización antes de comprar. Abrir este enlace no realiza un pago.</p>
    <p>Si el servicio fue retirado o no tiene capacidad, tu agente te indicará el motivo y no iniciará la compra.</p>
    {connect && <p><a href={serviceSelectionHref('/hub', id)}>Continuar con mi agente para este servicio</a></p>}
  </aside>;
}
