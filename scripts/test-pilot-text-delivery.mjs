import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { preparePilotTextDelivery } from '../examples/pilot-text-delivery.mjs';
import { parseOperationHistoryInput } from '../lib/operation-history.ts';

const input = { origin: 'https://pilot.example', taskId: randomUUID(), text: 'Resultado de demostración conservado.' };
const prepared = preparePilotTextDelivery(input);
const recovered = JSON.parse(JSON.stringify(prepared));
assert.deepEqual(recovered, prepared);
assert.equal(recovered.claim.attemptId, recovered.respond.attemptId);
assert.equal(recovered.record.operation.clientOperationId, recovered.respond.operationId);
assert.equal(recovered.record.operation.taskId, recovered.claim.taskId);
assert.equal(recovered.record.operation.delivery.result.text, input.text);
assert.equal(recovered.record.operation.payment.amountAtomic, '0');
assert.equal(recovered.record.operation.payment.status, 'not-requested');
parseOperationHistoryInput(recovered.record.operation);
for (const change of [{ origin: 'http://pilot.example' }, { origin: 'https://pilot.example/' }, { taskId: 'invalid' }, { text: ' ' }, { text: 'x'.repeat(2001) }, { text: 'Bearer sensitive-token' }]) {
  assert.throws(() => preparePilotTextDelivery({ ...input, ...change }));
}
console.log(JSON.stringify({ ok: true, scope: 'offline demonstration argument/schema validation', preservedClaimAndResponseIds: true, deliveryReferenceMatchesOperation: true, rejectsSensitiveContent: true, externalRequests: 0, payments: 0, limitation: 'Does not prove hosted MCP registration or task ownership' }));
