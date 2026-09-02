import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Address, Horizon, Networks, Transaction, scValToNative } from "@stellar/stellar-sdk";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { assertActiveTestnetPayerSecret } from "../lib/testnet-payer-safety.ts";
import { executeWebsiteIntelligenceOneShot, prepareWebsiteIntelligenceOneShot, requestWebsiteIntelligencePaymentChallenge, requireWebsiteIntelligenceLocalEndpoint, validateWebsiteIntelligencePaymentRequired } from "../lib/website-intelligence-one-shot.ts";
import { canonicalInputHash, canonicalServiceCardHash, WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT, WEBSITE_INTELLIGENCE_LOCAL_BASE_URL, WEBSITE_INTELLIGENCE_ROUTE } from "../lib/website-intelligence-readiness.ts";
import { createPrivateRecoveryCapsule, recoveryProofForToken } from "../lib/delivery-recovery-handoff.ts";
import { recoverWebsiteIntelligenceDelivery } from "../lib/website-intelligence-recovery-client.ts";
import { X402_NETWORK, X402_SCHEME, X402_USDC_CONTRACT } from "../lib/x402-config.ts";

const USDC_TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

for (const raw of readFileSync(".env.x402.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim(), separator = line.indexOf("=");
  if (line && !line.startsWith("#") && separator > 0) {
    const key = line.slice(0, separator), value = line.slice(separator + 1);
    if (process.env[key] !== undefined && process.env[key] !== value) throw new Error(`X402_LOCAL_ENV_CONFLICT_${key}`);
    process.env[key] = value;
  }
}

function decimalToAtomic(value) {
  if (!/^\d+(?:\.\d{1,7})?$/.test(value)) throw new Error("MALFORMED_USDC_BALANCE");
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"))).toString();
}

function assertSignedTransferMatches(paymentPayload, expected) {
  const transactionXdr = paymentPayload?.payload?.transaction;
  if (typeof transactionXdr !== "string") throw new Error("SIGNED_TRANSFER_XDR_MISSING");
  const transaction = new Transaction(transactionXdr, Networks.TESTNET);
  if (transaction.operations.length !== 1) throw new Error("SIGNED_TRANSFER_OPERATION_MISMATCH");
  const operation = transaction.operations[0];
  if (operation.type !== "invokeHostFunction" || operation.func.switch().name !== "hostFunctionTypeInvokeContract") throw new Error("SIGNED_TRANSFER_OPERATION_MISMATCH");
  const invocation = operation.func.invokeContract(), args = invocation.args();
  const asset = Address.fromScAddress(invocation.contractAddress()).toString();
  if (invocation.functionName().toString() !== "transfer" || args.length !== 3
    || asset !== expected.asset
    || String(scValToNative(args[0])) !== expected.payer
    || String(scValToNative(args[1])) !== expected.payTo
    || BigInt(scValToNative(args[2])) !== BigInt(expected.amount)) {
    throw new Error("SIGNED_TRANSFER_TARGET_MISMATCH");
  }
}

async function getBalances(address) {
  const account = await new Horizon.Server("https://horizon-testnet.stellar.org").loadAccount(address);
  const usdc = account.balances.find(balance => balance.asset_type !== "native" && balance.asset_code === "USDC" && balance.asset_issuer === USDC_TESTNET_ISSUER);
  const xlm = account.balances.find(balance => balance.asset_type === "native");
  if (!usdc) throw new Error("USDC_TESTNET_TRUSTLINE_OR_BALANCE_MISSING");
  if (!xlm || Number(xlm.balance) <= 1) throw new Error("INSUFFICIENT_XLM_RESERVE_PREFLIGHT");
  return { atomic: decimalToAtomic(usdc.balance), ledger: Number(account.last_modified_ledger) };
}

async function waitForExactBalanceDeltas(payerAddress, sellerAddress, beforePayer, beforeSeller) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const payer = await getBalances(payerAddress), seller = await getBalances(sellerAddress);
    const payerDelta = BigInt(payer.atomic) - BigInt(beforePayer.atomic), sellerDelta = BigInt(seller.atomic) - BigInt(beforeSeller.atomic);
    if (payerDelta === -BigInt(WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT) && sellerDelta === BigInt(WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT)) return { payer, seller, payerDelta: payerDelta.toString(), sellerDelta: sellerDelta.toString() };
    if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw new Error("TESTNET_BALANCE_DELTAS_NOT_OBSERVED");
}

const execute = process.argv.includes("--execute-one-shot");
const acknowledgementOne = process.argv.includes("--acknowledge-exactly-one-payment");
const acknowledgementTwo = process.argv.includes("--acknowledge-testnet-10000-atomic");
const localBaseUrl = process.env.WEBSITE_INTELLIGENCE_LOCAL_BASE_URL ?? WEBSITE_INTELLIGENCE_LOCAL_BASE_URL;
const endpoint = requireWebsiteIntelligenceLocalEndpoint(localBaseUrl);
const serviceCardUrl = new URL("/v1/service-card", new URL(localBaseUrl).origin).toString();
const payerAddress = process.env.X402_PAYER_ADDRESS?.trim() ?? "";
const expectedPayTo = process.env.WEBSITE_INTELLIGENCE_APPROVED_PAY_TO?.trim() || process.env.X402_SELLER_ADDRESS?.trim() || "";
const idempotencyKey = process.env.WEBSITE_INTELLIGENCE_IDEMPOTENCY_KEY?.trim() ?? `bazaar-recovery-${randomBytes(12).toString("hex")}`;
const requestBody = { language: "es", url: process.env.WEBSITE_INTELLIGENCE_TARGET_URL ?? "https://example.com" };
const recoveryToken = randomBytes(32).toString("base64url");
const recoveryIntent = { requestId: randomBytes(16).toString("hex"), proof: await recoveryProofForToken(recoveryToken) };

const cardResponse = await fetch(serviceCardUrl, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
if (!cardResponse.ok) throw new Error(`WEBSITE_CARD_UNAVAILABLE_${cardResponse.status}`);
const card = await cardResponse.json();
const computedCardHash = canonicalServiceCardHash(card);
const declaredCardHash = card?.payment?.binding?.cardHash;
if (declaredCardHash !== computedCardHash) throw new Error("SERVICE_CARD_CANONICAL_HASH_MISMATCH");
const configuredCardHash = process.env.WEBSITE_INTELLIGENCE_APPROVED_CARD_HASH?.trim() || "";
if (execute && !/^[0-9a-f]{64}$/.test(configuredCardHash)) throw new Error("EXPLICIT_APPROVED_CARD_HASH_REQUIRED_FOR_PAYMENT");
const approvedCardHash = configuredCardHash || computedCardHash;
if (card?.payment?.payTo !== expectedPayTo) throw new Error("SERVICE_CARD_PAY_TO_NOT_PINNED_SELLER");
const publicResourceUrl = card?.payment?.binding?.resourceUrl;
if (typeof publicResourceUrl !== "string") throw new Error("SERVICE_CARD_PUBLIC_RESOURCE_MISSING");
const balances = await getBalances(payerAddress);
const sellerBalancesBefore = await getBalances(expectedPayTo);
const report = await prepareWebsiteIntelligenceOneShot({ card, sourceUrl: serviceCardUrl, expectedPayTo, payerAddress, requestBody, idempotencyKey, approvedCardHash, executeRequested: execute, explicitOneShotAcknowledgement: acknowledgementOne && acknowledgementTwo }, { getBalance: async () => balances });
if (!report.readiness.ready || !report.payer.valid || !report.balance.sufficient) {
  console.log(JSON.stringify({ ok: false, mode: "dry-run", gate: "preflight", endpoint, payer: report.payer.displayed, balance: report.balance, cap: report.caps, failedRules: report.readiness.outcomes.filter(outcome => !outcome.ok).map(outcome => outcome.rule), paymentAttempted: false, signerCreated: false, secretsPrinted: false }, null, 2));
  throw new Error("PREFLIGHT_GATE_FAILED");
}
const challenge = await requestWebsiteIntelligencePaymentChallenge({ requestBody, idempotencyKey, localBaseUrl, expectedPayTo, approvedCardHash, publicResourceUrl, recoveryIntent });

if (!execute) {
  console.log(JSON.stringify({ ok: true, mode: "dry-run", endpoint, payer: report.payer.displayed, balance: report.balance, cap: report.caps, challenge: { status: challenge.status, inputHash: challenge.inputHash, requirementsValidated: true, signedPublicResourceValidated: true, recoveryBindingValidated: true }, paymentAttempted: false, signerCreated: false, recoveryTokenPrinted: false, secretsPrinted: false }, null, 2));
} else {
const secret = process.env.X402_PAYER_SECRET?.trim();
if (!secret) throw new Error("MISSING_X402_PAYER_SECRET");
if (assertActiveTestnetPayerSecret(secret) !== payerAddress) throw new Error("PAYER_SECRET_ADDRESS_MISMATCH");
const expected = { scheme: X402_SCHEME, network: X402_NETWORK, asset: X402_USDC_CONTRACT, payTo: expectedPayTo, amount: WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT, method: "POST", route: WEBSITE_INTELLIGENCE_ROUTE, inputHash: canonicalInputHash(requestBody), cardHash: approvedCardHash };
const result = await executeWebsiteIntelligenceOneShot({ endpoint, requestBody, idempotencyKey, expected, acknowledgementOne, acknowledgementTwo, balanceAtomic: balances.atomic, recoveryIntent, createPaidFetch: beforePayment => {
  const signer = createEd25519Signer(secret, X402_NETWORK);
  const client = new x402Client().register(X402_NETWORK, new ExactStellarScheme(signer));
  client.registerPolicy((_version, requirements) => requirements.filter(requirement => requirement.scheme === X402_SCHEME && requirement.network === X402_NETWORK && requirement.payTo === expectedPayTo && requirement.asset === X402_USDC_CONTRACT && requirement.amount === WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT));
  client.onBeforePaymentCreation(async () => { beforePayment(); });
  client.onAfterPaymentCreation(async ({ paymentPayload }) => {
    assertSignedTransferMatches(paymentPayload, { payer: payerAddress, payTo: expectedPayTo, asset: X402_USDC_CONTRACT, amount: WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT });
  });
  return wrapFetchWithPayment(fetch, client);
} });
if (!result.envelope.recovery.available || !result.envelope.recovery.recoveryId) throw new Error("RECOVERY_NOT_AVAILABLE_AFTER_DELIVERY");
const capsule = createPrivateRecoveryCapsule({ serviceId: result.envelope.service.id, providerOrigin: new URL(endpoint).origin, recoveryPath: "/v1/x402/audits/recover", requestId: recoveryIntent.requestId, recoveryToken });
const recovered = await recoverWebsiteIntelligenceDelivery({ providerOrigin: new URL(endpoint).origin, capsule, recoveryId: result.envelope.recovery.recoveryId, expected: result.envelope });
const balanceEvidence = await waitForExactBalanceDeltas(payerAddress, expectedPayTo, balances, sellerBalancesBefore);
console.log(JSON.stringify({ ok: true, mode: "executed-one-shot-with-recovery", endpoint, payer: report.payer.displayed, cap: report.caps, settlement: { transactionHash: result.transactionHash, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.transactionHash}`, ledger: result.ledger, resultHash: result.resultHash, reconciled: result.reconciled }, recovery: { available: result.envelope.recovery.available, recoveryId: `${result.envelope.recovery.recoveryId.slice(0, 8)}…${result.envelope.recovery.recoveryId.slice(-8)}`, recovered: recovered.reconciled, paymentAttempted: recovered.paymentAttempted }, balances: { payerBeforeAtomic: balances.atomic, payerAfterAtomic: balanceEvidence.payer.atomic, payerDeltaAtomic: balanceEvidence.payerDelta, sellerBeforeAtomic: sellerBalancesBefore.atomic, sellerAfterAtomic: balanceEvidence.seller.atomic, sellerDeltaAtomic: balanceEvidence.sellerDelta }, recoveryTokenPrinted: false, secretsPrinted: false, authPayloadPrinted: false }, null, 2));
}
