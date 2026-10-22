"use client";

import {useEffect, useState} from 'react';
import {publicServicePath, publicServiceUrl} from '@/lib/market-service-share';

export function ServiceShare({serviceId, serviceName, origin}: {serviceId: string; serviceName?: string; origin?: string}) {
  const [url, setUrl] = useState('');
  const [notice, setNotice] = useState('');
  const path = publicServicePath(serviceId);
  useEffect(() => {
    // A supplied deployment origin can never move a visitor's share link to another environment.
    setUrl(publicServiceUrl(origin === window.location.origin ? origin : window.location.origin, serviceId));
    setNotice('');
  }, [origin, serviceId]);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice('Enlace copiado.'); }
    catch { setNotice('Selecciona el enlace para copiarlo.'); }
  }
  return <section aria-label={`Compartir ${serviceName ?? 'servicio'}`}>
    <p><strong>Enlace público del servicio</strong></p>
    {url && <p className="portfolio-fine"><a href={path}>{url}</a></p>}
    <div className="ui-actions">
      <button type="button" className="ui-button" onClick={copy} disabled={!url}>Copiar enlace</button>
      <a className="ui-button" href={`${path}/qr.svg`} download={`bazaar-${serviceId}.svg`}>Descargar QR</a>
    </div>
    <p className="portfolio-fine">Abrir el enlace o escanear el QR permite consultar la ficha. La compra requiere autorización y firma desde tu agente.</p>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
