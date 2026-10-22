import {createSellerCard} from './seller-service-card.mjs';

export const RECOVERY_EXAMPLE_SERVICE_ID = 'bazaar-recovery-example-text-v1';
export const RECOVERY_EXAMPLE_SERVICE_VERSION = 'recovery-example-text/v1';
export const RECOVERY_EXAMPLE_ROUTE = '/v1/bazaar-recovery-example';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && keys.every(key => own.includes(key));
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** Public card only. Origin and destination must be supplied by the operator. */
export function createRecoveryExampleCard(configuration) {
  if (!exactObject(configuration, ['providerOrigin', 'destination'])) {
    throw Error('RECOVERY_EXAMPLE_CONFIGURATION_REQUIRED');
  }
  return freeze(createSellerCard({
    id: RECOVERY_EXAMPLE_SERVICE_ID,
    name: 'Comprobante de prueba Bazaar',
    description: 'Devuelve un texto breve y determinista para comprobar entrega y recuperación por pedido. Envía exactamente {"format":"text"}. El texto no certifica el pago.',
    providerName: 'Bazaar — servicio de ejemplo',
    providerOrigin: configuration.providerOrigin,
    destination: configuration.destination,
    route: RECOVERY_EXAMPLE_ROUTE,
    amount: '0.01',
    input: [{name: 'format', type: 'string', required: true}],
    tags: ['text', 'example', 'recovery', 'testnet', 'x402'],
    skill: {
      version: '1.0.0',
      title: 'Comprobar una entrega recuperable',
      instructions: 'Consulta la ficha y disponibilidad actuales. Tras autorización del comprador, crea una orden x402 Stellar Testnet con input {"format":"text"}. Firma sólo en la wallet del comprador. Conserva operationId y recupera la misma orden mediante get_market_order. Consulta el estado de pago por separado del texto entregado; una respuesta perdida no autoriza otro pago ni otra ejecución.',
    },
  }));
}

/** The existing seller worker verifies paid ownership before invoking this adapter. */
export async function execute(packet) {
  if (!exactObject(packet, ['operationId', 'attemptId', 'input']) ||
      typeof packet.operationId !== 'string' || !uuid.test(packet.operationId) ||
      typeof packet.attemptId !== 'string' || !uuid.test(packet.attemptId) ||
      !exactObject(packet.input, ['format']) || packet.input.format !== 'text') {
    throw Error('INVALID_RECOVERY_EXAMPLE_INPUT');
  }
  return {
    text: [
      'Comprobante de prueba Bazaar',
      `Versión: ${RECOVERY_EXAMPLE_SERVICE_VERSION}`,
      `Pedido: ${packet.operationId}`,
      'Resultado: texto de ejemplo recuperable desde la misma orden.',
      'Consulta el estado del pago por separado en Bazaar.',
    ].join('\n'),
  };
}

/** Adapter health only; shared daily capacity remains the worker/store's responsibility. */
export async function availability() {
  return {ready: true};
}
