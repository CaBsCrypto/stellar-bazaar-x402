// Instructions only: importing this module never creates a wallet or requests funds.
export const testnetFundingInstructions = `Antes de pagar, comprueba la red Stellar Testnet, el activo exacto exigido por el servicio y el saldo disponible de la wallet que firmará.
- Si ya tiene saldo suficiente del activo correcto, continúa sin usar el faucet.
- Si falta USDC de Testnet, usa Sozu Faucet: https://faucet.sozu.capital/ . Es un servicio externo de fondos de prueba, no una compra ni una garantía de disponibilidad.
- Si ya tienes una wallet compatible, conserva esa dirección: npx @sozu/faucet@latest claim <DIRECCION_PUBLICA>. Sustituye el marcador por su dirección pública G… o C…; nunca pases claves secretas. Comprueba que tu cliente puede firmar con esa cuenta.
- Solo si no tienes wallet de pruebas, ejecuta: npx @sozu/faucet@latest claim. Crea una cuenta G…, la financia con Friendbot, añade la línea de confianza y solicita USDC.
- Una cuenta G… existente necesita la línea de confianza de Circle USDC. Si recibes trustline_required, configúrala con el firmante local de esa wallet siguiendo las indicaciones de Sozu; no generes otra wallet para evitar el error. Puede necesitar XLM de Testnet para su reserva.
- Si el resultado incluye wallet.secret, guárdala una sola vez en el almacén local de secretos del agente. No copies el JSON sin filtrar al chat, historial, MCP ni registros públicos; informa solo la dirección pública y el resultado. Nunca pidas al humano su clave secreta.
- Tras la solicitud, vuelve a verificar red, contrato/emisor del activo y saldo; no basta el nombre USDC. Puedes consultar la dirección en https://stellar.expert/explorer/testnet. Si falla el faucet o no alcanza el saldo, informa el bloqueo y no intentes pagar ni repetir solicitudes indefinidamente.
Para XLM de Testnet, Friendbot (https://friendbot.stellar.org) puede financiar una cuenta de prueba G…; reutiliza la existente y verifica su saldo gastable, descontando reservas y obligaciones. No cambies de activo después de iniciar un pago.
Recibir fondos de prueba no autoriza una compra: respeta el presupuesto y las condiciones de la tarea.`;

export const buyerConnectionPrompt = `Exploremos Bazaar: según lo que necesito, compara servicios, recomiéndame uno y comprémoslo dentro del presupuesto y activo que te autorice. Si falta esa información, pregúntame. Revisa la entrega y muéstrame el resultado.

Lee la guía y revisa todas las herramientas disponibles, incluida la paginación del listado si existe. Identifica cuáles sirven para mi objetivo y comprueba qué configuración falta antes de comprar; revisar herramientas no autoriza ejecutarlas. Sigue la guía de pagos Testnet y, si un pago queda incierto, recupera su estado sin repetirlo. Nunca compartas claves privadas.

Guía: https://bazaar.browns.studio/llms.txt
MCP: https://bazaar.browns.studio/api/mcp`;
