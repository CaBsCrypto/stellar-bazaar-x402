'use client';
import {ButtonLink} from '@/components/ui';
import {CopyText} from '@/components/ui/CopyText';
import {useBazaarOrigin} from '@/components/useBazaarOrigin';
import {buyerAgentInstructions, serviceSelectionHref} from '@/lib/service-selection';

export function AgentDirectConnectCard({role = 'buyer', compact=false, serviceId}: {role?: 'buyer' | 'seller'; compact?: boolean; serviceId?: string}) {
  const origin = useBazaarOrigin(), buyer = role === 'buyer';
  const prompt = buyer
    ? buyerAgentInstructions(origin, serviceId)
    : `Conecta con Bazaar por MCP en ${origin}/api/mcp. Consulta get_bazaar_capabilities, tools/list y la skill de vendedor ${origin}/skills/seller/SKILL.md. Ayúdame a preparar una API HTTPS real, una ficha para entrega text/plain con un precio positivo elegido por mí en USDC oficial de Stellar Testnet y x402-stellar-exact-v2, y la prueba de control del endpoint. Usa únicamente mi acceso de agente propio, con market:submit concedido por mi acceso humano. Guarda submissionId, ficha y controlProof antes de submit_market_service; recupera con get_market_submission sin inventar otra solicitud. La publicación requiere verificación y revisión manual. Ejecuta pedidos sólo después de comprobar pago y conservar su intento estable; ante ejecución incierta, usa uncertain_market_order y no repitas el efecto. No incluyas credenciales en el prompt.`;
  return <section className='connect-instructions' aria-label={buyer ? 'Conexión del comprador' : 'Conexión del vendedor'}>
    {!compact && <h2>{buyer ? 'Compra con tu agente externo' : 'Publica con tu agente externo'}</h2>}
    <p className='ui-muted'>{buyer ? 'Compara servicios activos y encarga entregas de texto desde el agente que utilizas.' : 'Define tu servicio, prepara la integración y autoriza a tu agente para enviarla a revisión.'}</p>
    <CopyText text={prompt} label='Instrucciones para mi agente' compact/>
    <div className='ui-actions'><ButtonLink href={serviceSelectionHref('/open', serviceId)} variant='secondary'>Crear mi espacio</ButtonLink><ButtonLink href={serviceSelectionHref('/history', serviceId)} variant='quiet'>Abrir mi espacio</ButtonLink></div>
    <p>Importa la conexión MCP desde Crear mi espacio. El catálogo funciona sin credencial; los pedidos y servicios propios requieren tu acceso de agente.</p>
    <details className='connect-help'><summary>Requisitos y recuperación</summary><p>Tu agente se ejecuta en tu infraestructura y necesita un cliente MCP por HTTP, almacenamiento privado y un firmante local compatible para comprar. Guarda las intenciones antes de enviar. Una respuesta perdida se consulta con el mismo identificador; la recuperación es explícita.</p><p>Cada ficha define su precio en USDC oficial de Stellar Testnet. El agente comprador paga directamente al vendedor mediante x402. Bazaar conserva el pedido y la entrega; el pago verificado no certifica su calidad.</p><a href='/MARKETPLACE_PILOT.md'>Leer la guía del mercado abierto</a></details>
  </section>;
}
