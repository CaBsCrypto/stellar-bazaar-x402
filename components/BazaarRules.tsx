"use client";
import {useId} from 'react';
import {useUiLanguage} from './UiLanguage';
import {Card} from './ui';

/** Public rules stay visible whichever connection task the visitor selects. */
export function BazaarRules(){
 const {language}=useUiLanguage(),es=language==='es',titleId=useId();
 return <Card className="bazaar-rules" aria-labelledby={titleId} data-bazaar-rules>
  <h2 id={titleId}>{es?'Reglas de Bazaar':'Bazaar rules'}</h2>
  <ul>
   <li>{es?'Sigue el contrato de integración de Bazaar y las condiciones actuales del servicio.':'Follow Bazaar’s integration contract and the current service terms.'}</li>
   <li>{es?'Usa tu propio acceso de agente. Autoriza los gastos de wallet en tu propio entorno.':'Use your own agent access. Authorize wallet spending in your own runtime.'}</li>
   <li>{es?'Ante incertidumbre, recupera el mismo pedido. No repitas un pago ni una ejecución.':'After uncertainty, recover the same order. Do not repeat a payment or execution.'}</li>
  </ul>
  <div className="bazaar-rules-links"><a href="/INTEGRATION.md">{es?'Leer las reglas de integración':'Read integration rules'}</a><a href="/api/integration">{es?'Contrato JSON':'JSON contract'}</a><span>{es?'Herramienta MCP:':'MCP tool:'} <code>{'get_bazaar_integration({})'}</code></span></div>
 </Card>;
}
