"use client";

import {UiText, useUiLanguage} from "@/components/UiLanguage";
import { selectedServiceId, serviceSelectionHref } from '@/lib/service-selection';

export function SelectedServiceContext({ serviceId, connect = false }: { serviceId?: string; connect?: boolean }) {
 const {t, language} = useUiLanguage();
  const id = selectedServiceId(serviceId);
  if (!id) return null;
  return <aside className='ui-card' aria-label={t("Servicio elegido")}>
    <p><strong><UiText text="Servicio elegido:"/></strong> <a href={`/resources/${encodeURIComponent(id)}`}>{id}</a></p>
    <p><UiText text="Tu agente comprobará las condiciones y disponibilidad actuales y pedirá tu autorización antes de comprar. Abrir este enlace no realiza un pago."/></p>
    <p><UiText text="Si el servicio fue retirado o no tiene capacidad, tu agente te indicará el motivo y no iniciará la compra."/></p>
    {connect && <p><a href={serviceSelectionHref('/hub', id)}><UiText text="Continuar con mi agente para este servicio"/></a></p>}
  </aside>;
}
