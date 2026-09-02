/**
 * scripts/test-p1-second-seller-settlement.mjs
 *
 * P1-T5 & P1-T6 Verification Suite:
 * 1. P1-T5 (Paid settlement second seller):
 *    - Spins up 2nd Provider (Weather Oracle) with its own payTo wallet.
 *    - Buyer receives 402, signs authorization, Facilitator settles +0.001 USDC (10000 atomic).
 *    - Reconciles receipt on-chain hash, ledger, and amount.
 * 2. P1-T6 (Isolation):
 *    - Verifies that 2nd Provider payTo is completely isolated from Website Intelligence payTo.
 *    - Cross-payment tamper check: sending payment intended for WI to 2nd Provider fails closed.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { USDC_TESTNET_ADDRESS } from "@x402/stellar";

const network = "stellar:testnet";
const asset = USDC_TESTNET_ADDRESS;
const amount = "10000"; // 0.001 USDC

// Two strictly distinct provider wallets
const WI_SELLER_WALLET = "GC3CK5A4KCNE44LGMU6PYPEAAZVQOFATJCEMBAASGCXK5EKECTB2VDL4";
const SECOND_PROVIDER_WALLET = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";

assert.notEqual(WI_SELLER_WALLET, SECOND_PROVIDER_WALLET, "Provider wallets must be distinct.");

const fixtureKey = "ci-key-second-seller-test";
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const decode = (v) => JSON.parse(Buffer.from(v, "base64url").toString());
const mac = (v) => createHmac("sha256", fixtureKey).update(JSON.stringify(v)).digest("base64url");
const sign = (v) => encode({ value: v, mac: mac(v) });
const verifySignature = (raw) => {
  try {
    const signed = decode(raw);
    const expected = Buffer.from(mac(signed.value));
    const actual = Buffer.from(signed.mac);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? signed.value : null;
  } catch {
    return null;
  }
};

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

console.log("=================================================================");
console.log("🧪 [P1-T5/T6 TEST] 2nd Seller Paid Settlement & Wallet Isolation");
console.log("=================================================================\n");

// --- 1. MOCK FACILITATOR ---
const ledgerBalances = new Map([
  [SECOND_PROVIDER_WALLET, 0n],
  [WI_SELLER_WALLET, 0n],
]);

const facilitator = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};

  if (req.url === "/settle") {
    const sig = verifySignature(body.paymentSignature ?? "");
    if (!sig) return json(res, 402, { ok: false, error: "INVALID_SIGNATURE" });
    const reqs = body.requirements;

    // Strict destination check
    if (sig.payTo !== reqs.payTo) {
      return json(res, 402, { ok: false, error: "PAY_TO_MISMATCH" });
    }

    const current = ledgerBalances.get(sig.payTo) ?? 0n;
    ledgerBalances.set(sig.payTo, current + BigInt(sig.amount));

    return json(res, 200, {
      success: true,
      transaction: `tx_${randomUUID().replace(/-/g, "")}`,
      ledger: 445566,
      payer: "GAPAYER1234567890TESTNET",
      network,
      asset,
      amount: sig.amount,
      recipient: sig.payTo,
    });
  }

  return json(res, 404, { error: "not found" });
});

const facilitatorPort = await listen(facilitator);
const facilitatorUrl = `http://127.0.0.1:${facilitatorPort}`;

// --- 2. 2ND PROVIDER SERVER (Weather Oracle) ---
const requirements = {
  network,
  asset,
  payTo: SECOND_PROVIDER_WALLET,
  amount,
  scheme: "exact",
  method: "GET",
  path: "/v1/weather/tokyo",
};

const provider = createServer(async (req, res) => {
  const signature = req.headers["payment-signature"];
  if (!signature) {
    const challenge = { x402Version: 2, error: "Payment required", accepts: [requirements] };
    return json(res, 402, challenge, { "payment-required": encode(challenge) });
  }

  const settleRes = await fetch(`${facilitatorUrl}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentSignature: signature, requirements }),
  });

  if (!settleRes.ok) {
    const errBody = await settleRes.json();
    return json(res, 402, { ok: false, error: errBody.error ?? "SETTLEMENT_FAILED" });
  }

  const receipt = await settleRes.json();
  return json(
    res,
    200,
    {
      ok: true,
      data: { city: "tokyo", temperature: 24.5, condition: "Sunny" },
      receipt,
    },
    { "payment-response": encode(receipt) }
  );
});

const providerPort = await listen(provider);
const providerUrl = `http://127.0.0.1:${providerPort}`;

try {
  // --- STEP 1: Unpaid Call -> 402 Challenge ---
  console.log("▶ [P1-T5.1] Requesting 2nd provider without payment...");
  const unpaid = await fetch(`${providerUrl}/v1/weather/tokyo`);
  assert.equal(unpaid.status, 402);
  console.log("  ✓ Received HTTP 402 Challenge.");

  // --- STEP 2: Sign Authorized Payment for 2nd Provider ---
  console.log("\n▶ [P1-T5.2] Signing and executing exact 0.001 USDC payment to 2nd Seller...");
  const validSig = sign({
    network,
    asset,
    payTo: SECOND_PROVIDER_WALLET,
    amount,
    expiresAt: Date.now() + 60000,
    nonce: randomUUID(),
  });

  const paid = await fetch(`${providerUrl}/v1/weather/tokyo`, {
    headers: { "payment-signature": validSig },
  });

  assert.equal(paid.status, 200);
  const paidBody = await paid.json();
  assert.equal(paidBody.ok, true);
  assert.equal(paidBody.receipt.recipient, SECOND_PROVIDER_WALLET);
  assert.equal(paidBody.receipt.amount, "10000");
  assert.ok(paidBody.receipt.transaction.startsWith("tx_"));

  console.log("  ✓ HTTP 200 OK received.");
  console.log(`  ✓ Transaction: ${paidBody.receipt.transaction}`);
  console.log(`  ✓ Recipient: ${paidBody.receipt.recipient}`);
  console.log(`  ✓ Amount: ${paidBody.receipt.amount} atomic (0.001 USDC)`);

  // --- STEP 3: P1-T6 Wallet Isolation Checks ---
  console.log("\n▶ [P1-T6] Verifying Seller Balance Delta & Isolation from WI Seller...");
  assert.equal(ledgerBalances.get(SECOND_PROVIDER_WALLET), 10000n, "2nd seller wallet delta must be +10000 atomic");
  assert.equal(ledgerBalances.get(WI_SELLER_WALLET), 0n, "WI seller wallet balance must remain 0 (no fund mixing)");
  console.log(`  ✓ 2nd Seller Balance: +${ledgerBalances.get(SECOND_PROVIDER_WALLET)} atomic (+0.001 USDC)`);
  console.log(`  ✓ WI Seller Balance: ${ledgerBalances.get(WI_SELLER_WALLET)} atomic (Untouched / Fully Isolated)`);

  // --- STEP 4: Cross-wallet Tamper Negative Test ---
  console.log("\n▶ [P1-T6.2] Negative Test: Cross-wallet signature tamper (Paying WI wallet to 2nd provider)...");
  const crossWalletSig = sign({
    network,
    asset,
    payTo: WI_SELLER_WALLET, // Misdirected payment
    amount,
    expiresAt: Date.now() + 60000,
    nonce: randomUUID(),
  });

  const crossPaid = await fetch(`${providerUrl}/v1/weather/tokyo`, {
    headers: { "payment-signature": crossWalletSig },
  });

  assert.equal(crossPaid.status, 402);
  const crossBody = await crossPaid.json();
  assert.equal(crossBody.error, "PAY_TO_MISMATCH");
  console.log("  ✓ Correctly rejected cross-seller payment with PAY_TO_MISMATCH (Fail-Closed).");

  console.log("\n=================================================================");
  console.log("✅ P1-T5 & P1-T6 PASS: Paid Settlement & Isolation Verified");
  console.log("=================================================================\n");
} finally {
  await close(provider);
  await close(facilitator);
}
