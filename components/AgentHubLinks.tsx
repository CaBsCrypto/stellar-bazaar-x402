"use client";
import {useUiLanguage} from './UiLanguage';
import {ButtonLink,Card} from './ui';

export function AgentHubLinks(){
 const {language}=useUiLanguage(),es=language==='es';
 return <Card id="conectar-agente" className="agent-entry" aria-label={es?'Conectar mi agente':'Connect My Agent'} data-agent-hub-links>
  <h2>{es?'Conectar mi agente':'Connect My Agent'}</h2>
  <p className="ui-muted">{es?'Conecta tu agente con Bazaar para comprar, vender o consultar las reglas de integración.':'Connect your agent to Bazaar to buy, sell or read the integration rules.'}</p>
  <div className="ui-actions">
   <ButtonLink href="/hub?tab=buy" variant="secondary">{es?'Comprar':'Buy'}</ButtonLink>
   <ButtonLink href="/hub?tab=sell" variant="secondary">{es?'Vender':'Sell'}</ButtonLink>
   <ButtonLink href="/hub?tab=connect">{es?'Conectar':'Connect'}</ButtonLink>
   <a href="/INTEGRATION.md">{es?'Leer las reglas de Bazaar':'Read Bazaar rules'}</a>
  </div>
 </Card>;
}
