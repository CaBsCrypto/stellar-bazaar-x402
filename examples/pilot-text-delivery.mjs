import { randomUUID } from 'node:crypto';
import { parseOperationHistoryInput } from '../lib/operation-history.ts';

/** Prepare once and preserve the returned arguments before calling any tool.
 * This helper performs no HTTP, Redis, payment or external-agent execution.
 * Metadata identifies an unpaid pilot demonstration, not a purchased service.
 */
export function preparePilotTextDelivery({ origin, taskId, text }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Exact pilot HTTPS origin required');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(taskId)) throw new Error('Task UUID required');
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Nonempty text of at most 2000 characters required');
  const attemptId = randomUUID(), operationId = randomUUID(), messageId = randomUUID();
  const operation = parseOperationHistoryInput({
    clientOperationId: operationId, taskId, mode: 'fixture',
    service: { id: 'pilot-text-demo', title: 'Entrega de texto del piloto', provider: 'Agente externo del participante', url: `${origin}/pilot` },
    // Required legacy schema metadata only. No payment instruction or real recipient.
    payment: { status: 'not-requested', network: 'stellar:testnet', asset: 'USDC', amountAtomic: '0', recipient: 'G' + 'A'.repeat(55) },
    delivery: { status: 'reported-delivered', result: { text } },
  });
  return {
    version: 'bazaar-pilot-text-intent/v1',
    claim: { taskId, attemptId },
    record: { operation },
    respond: { taskId, attemptId, messageId, text: `Entrega de texto registrada: ${operationId}.`, operationId },
  };
}
