import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gate = await readFile(new URL("../docs/E2E_TESTNET_READINESS_GATE.md", import.meta.url), "utf8");
const ui = await readFile(new URL("../components/PaymentFlowVisualizer.tsx", import.meta.url), "utf8");
const capability = await readFile(new URL("../lib/payment-flow.ts", import.meta.url), "utf8");

const receiptFields = [
  "receiptVersion", "serviceId", "serviceCardVersion", "serviceCardHash", "requestId",
  "method", "resourceUrl", "challengeExpiresAt", "scheme", "network", "assetSymbol",
  "assetContract", "atomicAmount", "decimals", "payTo", "settlementStatus",
  "transactionHash", "ledger", "settledAt", "facilitator", "deliveryStatus",
  "resultContentType", "resultDigest", "payerDisplay", "payToDisplay",
];
for (const field of receiptFields) assert.ok(gate.includes(`\`${field}\``), `receipt gate missing ${field}`);

const requiredLiveLabels = [
  "discovered", "quote-inspected", "402-received", "policy-pending", "policy-approved",
  "policy-rejected", "settlement-pending", "settled", "settlement-rejected",
  "delivery-pending", "delivered", "delivery-failed", "receipt-pending",
  "receipt-reconciled", "receipt-mismatch",
];
for (const label of requiredLiveLabels) assert.ok(gate.includes(`\`${label}\``), `state gate missing ${label}`);

for (const marker of ["NO WALLET", "NO SIGNING", "NO PAYMENT", "NO PROVIDER CALL"]) {
  assert.ok(ui.includes(marker), `disabled UI boundary missing: ${marker}`);
}
for (const marker of ["wallet: false", "signing: false", "payment: false", "settlement: false", "providerInvocation: false"]) {
  assert.ok(capability.includes(marker), `MCP side-effect boundary missing: ${marker}`);
}

assert.ok(gate.includes("NO-GO for a new Testnet settlement"));
assert.ok(gate.includes("A transaction hash alone is never sufficient"));
assert.ok(!/<button[^>]*(sign|pay|settle)/i.test(ui), "real sign/pay/settle control must not exist");

console.log(JSON.stringify({
  ok: true,
  decision: "NO-GO",
  receiptFields: receiptFields.length,
  liveStateLabels: requiredLiveLabels.length,
  realPaymentControls: 0,
}, null, 2));
