import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectedStages = ["discover", "quote", "challenge-402", "buyer-policy", "settle", "delivery", "receipt"];
const contract = await readFile(new URL("../lib/payment-flow.ts", import.meta.url), "utf8");
let lastIndex = -1;
for (const stage of expectedStages) {
  const index = contract.indexOf(`  | "${stage}"`, lastIndex + 1);
  assert.ok(index > lastIndex, `stage missing or out of order: ${stage}`);
  lastIndex = index;
}
for (const marker of [
  'currentRun: "visualization-only"',
  'paymentMode: "historical-testnet-evidence" | "inactive"',
  'policyOwner: "buyer"',
  'wallet: false',
  'signing: false',
  'payment: false',
  'settlement: false',
  'providerInvocation: false',
]) assert.ok(contract.includes(marker), `contract marker missing: ${marker}`);

const ui = (await readFile(new URL("../components/PaymentFlowVisualizer.tsx", import.meta.url), "utf8")).toLowerCase();
for (const marker of ["no wallet", "no signing", "no payment", "no provider call", "historical evidence", "inactivo"]) {
  assert.ok(ui.includes(marker), `truthful UI marker missing: ${marker}`);
}

const baseUrl = process.env.BASE_URL;
if (baseUrl) {
  const response = await fetch(`${baseUrl}/payment-flow`);
  assert.equal(response.status, 200);
  const html = (await response.text()).toLowerCase();
  for (const marker of ["no wallet", "no signing", "no payment", "descubrir", "reconciliar recibo"]) {
    assert.ok(html.includes(marker), `rendered marker missing: ${marker}`);
  }
}

console.log("payment-flow contract: PASS");
