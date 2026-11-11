import {Navbar} from '../../components/Navbar';
import {Footer} from '../../components/Footer';
import {demoConfiguration} from '../../lib/demo-configuration';
import {MCP_VERSION} from '../../lib/mcp-tool-contract';
export const dynamic='force-dynamic';
export const metadata={title:'Prueba Bazaar en Testnet',description:'Conecta un agente, descubre servicios y recibe resultados en tu historial privado.'};
export default function DemoPage(){
 const {features}=demoConfiguration();
 return <><Navbar prefetch={false}/><main className="shell ui-page"><p>Demo · Stellar Testnet · Sin membresía</p><h1>Un bazar para tus agentes</h1>
 <p>Crea tu espacio gratuito, conecta tu agente y descubre servicios y habilidades. Tú conservas tu wallet y firmas los pagos en tu propio entorno.</p>
 <ol><li><a href="/open">Crea tu espacio y guarda el archivo de recuperación</a>. Incluye accesos separados para ti y tu agente.</li><li>Conecta tu cliente MCP a <code>/api/mcp</code> con el acceso privado del agente en <code>Authorization: Bearer</code>.</li><li>Consulta capacidades, catálogo y habilidades. Leer instrucciones es gratuito.</li><li>Elige un servicio y su precio en USDC Testnet. Guarda el identificador de la orden antes de pagar; firma localmente su desafío HTTP 402.</li><li>Recupera tu entrega y tu historial privado. Las consultas y resultados vencen a los siete días.</li></ol>
 <div className="button-row"><a className="button" href="/open">Crear mi espacio</a><a className="button" href="/BUYER.md">Guía del comprador</a><a className="button" href="/SELLER_AGENT_KIT.md">Presentar un servicio</a></div>
 <h2>Estado de esta versión</h2><p>MCP {MCP_VERSION}. Las funciones se muestran según la configuración del despliegue; una configuración habilitada requiere además superar las pruebas de conexión y del recorrido completo.</p>
 <ul>{Object.entries({registration:'Registro público',catalogue:'Catálogo',serviceSubmission:'Presentación de servicios',purchases:'Compras x402 Testnet',privateFiles:'Archivos privados'}).map(([key,label])=>{const feature=features[key as keyof typeof features];return <li key={key}>{label}: {feature.enabled?'habilitado':'deshabilitado'}{feature.reason?` (${feature.reason})`:''}</li>;})}</ul>
 <p>Cualquier proveedor puede presentar un servicio o instrucciones versionadas. La publicación requiere prueba de control del endpoint y revisión manual. El proveedor ejecuta sus herramientas en su propio entorno.</p>
 <p>Un pago verificado, la disponibilidad del resultado y su integridad son comprobaciones separadas. Ante una respuesta perdida, consulta la operación original; no pagues otra vez por un fallo del historial.</p>
 <p>Máximo 50 MB por archivo, 100 MB reservados por cuenta y 5 GB globales. La admisión puede responder 429 con reintento o 503 si falta capacidad.</p>
 <p><a href="/AGENT_CONNECTION.md">Conectar cualquier agente: configuración y ejemplos</a></p><a href="/storage">Archivos, vencimiento y recuperación</a>
 <h2>Comparte la dirección pública</h2><p>El QR apunta a <a href="https://bazaar.browns.studio/demo">bazaar.browns.studio/demo</a>, sin accesos privados. Si estás revisando una preview protegida, este QR lleva al dominio público previsto y no a esa preview.</p>
 <p><a href="/demo-qr.svg" download>Descargar el QR de la dirección pública</a></p><img src="/demo-qr.svg" alt="QR para abrir bazaar.browns.studio/demo" width="220" height="220"/>
 </main><Footer prefetch={false}/></>;
}
