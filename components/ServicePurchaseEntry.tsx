"use client";

import {useEffect, useState} from 'react';

/** A lease expiring while the page is open cannot keep advertising availability. */
export function ServicePurchaseEntry({serviceId, available, leaseExpiresAt, unavailableReason, onDemand=false}: {
  serviceId: string; available: boolean; leaseExpiresAt?: string; unavailableReason: string;onDemand?:boolean;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const ready = available && (onDemand||!!leaseExpiresAt && (!now || Date.parse(leaseExpiresAt) > now));
  const reason = available && !ready ? 'Vendedor no disponible: su confirmación de capacidad venció' : unavailableReason;
  return <>
    <p role="status">{ready ? onDemand?'Disponibilidad por comprobar al preparar el pedido':'Vendedor disponible' : reason}</p>
    <a className="ui-button ui-button--primary" href={`/hub?service=${encodeURIComponent(serviceId)}`}>{ready ? 'Comprar con mi agente' : 'Conectar para consultar este servicio'}</a>
    <p className="portfolio-fine">Tu agente vuelve a comprobar precio, versión y disponibilidad antes de crear la orden. Autoriza un límite de gasto y firma en tu propia wallet. El pago va directamente al vendedor.</p>
    <a href={`/history?service=${encodeURIComponent(serviceId)}`}>Abrir mi historial privado</a>
  </>;
}
