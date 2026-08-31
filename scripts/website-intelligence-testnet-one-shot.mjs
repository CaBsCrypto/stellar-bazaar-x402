import { readFileSync } from "node:fs";
import { Address, Horizon, Networks, Transaction, scValToNative } from "@stellar/stellar-sdk";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { assertActiveTestnetPayerSecret } from "../lib/testnet-payer-safety.ts";
import { executeWebsiteIntelligenceOneShot, prepareWebsiteIntelligenceOneShot, requestWebsiteIntelligencePaymentChallenge, requireWebsiteIntelligenceLocalEndpoint, validateWebsiteIntelligencePaymentRequired } from "../lib/website-intelligence-one-shot.ts";
import { canonicalInputHash, WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT, WEBSITE_INTELLIGENCE_LOCAL_BASE_URL, WEBSITE_INTELLIGENCE_ROUTE } from "../lib/website-intelligence-readiness.ts";
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

const execute = process.argv.includes("--execute-one-shot");
const acknowledgementOne = process.argv.includes("--acknowledge-exactly-one-payment");
const acknowledgementTwo = process.argv.includes("--acknowledge-testnet-10000-atomic");
const localBaseUrl = process.env.WEBSITE_INTELLIGENCE_LOCAL_BASE_URL ?? WEBSITE_INTELLIGENCE_LOCAL_BASE_URL;
const endpoint = requireWebsiteIntelligenceLocalEndpoint(localBaseUrl);
const serviceCardUrl = new URL("/v1/service-card", new URL(localBaseUrl).origin).toString();
const payerAddress = process.env.X402_PAYER_ADDRESS?.trim() ?? "";
const expectedPayTo = process.env.WEBSITE_INTELLIGENCE_APPROVED_PAY_TO?.trim() ?? "";
const approvedCardHash = process.env.WEBSITE_INTELLIGENCE_APPROVED_CARD_HASH?.trim() ?? "";
const idempotencyKey = process.env.WEBSITE_INTELLIGENCE_IDEMPOTENCY_KEY?.trim() ?? `bazaar-local-${new Date().toISOString().slice(0, 10)}`;
const requestBody = { language: "es", url: process.env.WEBSITE_INTELLIGENCE_TARGET_URL ?? "https://example.com" };

const cardResponse = await fetch(serviceCardUrl, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
if (!cardResponse.ok) throw new Error(`WEBSITE_CARD_UNAVAILABLE_${cardResponse.status}`);
const card = await cardResponse.json();
const publicResourceUrl = card?.payment?.binding?.resourceUrl;
if (typeof publicResourceUrl !== "string") throw new Error("SERVICE_CARD_PUBLIC_RESOURCE_MISSING");
const balances = await getBalances(payerAddress);
const report = await prepareWebsiteIntelligenceOneShot({ card, sourceUrl: serviceCardUrl, expectedPayTo, payerAddress, requestBody, idempotencyKey, approvedCardHash, executeRequested: execute, explicitOneShotAcknowledgement: acknowledgementOne && acknowledgementTwo }, { getBalance: async () => balances });
if (!report.readiness.ready || !report.payer.valid || !report.balance.sufficient) {
  console.log(JSON.stringify({ ok: false, mode: "dry-run", gate: "preflight", endpoint, payer: report.payer.displayed, balance: report.balance, cap: report.caps, failedRules: report.readiness.outcomes.filter(outcome => !outcome.ok).map(outcome => outcome.rule), paymentAttempted: false, signerCreated: false, secretsPrinted: false }, null, 2));
  throw new Error("PREFLIGHT_GATE_FAILED");
}
const challenge = await requestWebsiteIntelligencePaymentChallenge({ requestBody, idempotencyKey, localBaseUrl, expectedPayTo, approvedCardHash, publicResourceUrl });

if (!execute) {
  console.log(JSON.stringify({ ok: true, mode: "dry-run", endpoint, payer: report.payer.displayed, balance: report.balance, cap: report.caps, challenge: { status: challenge.status, inputHash: challenge.inputHash, requirementsValidated: true, signedPublicResourceValidated: true }, paymentAttempted: false, signerCreated: false, secretsPrinted: false }, null, 2));
} else {
const secret = process.env.X402_PAYER_SECRET?.trim();
if (!secret) throw new Error("MISSING_X402_PAYER_SECRET");
if (assertActiveTestnetPayerSecret(secret) !== payerAddress) throw new Error("PAYER_SECRET_ADDRESS_MISMATCH");
const expected = { scheme: X402_SCHEME, network: X402_NETWORK, asset: X402_USDC_CONTRACT, payTo: expectedPayTo, amount: WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT, method: "POST", route: WEBSITE_INTELLIGENCE_ROUTE, inputHash: canonicalInputHash(requestBody), cardHash: approvedCardHash };
const result = await executeWebsiteIntelligenceOneShot({ endpoint, requestBody, idempotencyKey, expected, acknowledgementOne, acknowledgementTwo, balanceAtomic: balances.atomic, createPaidFetch: beforePayment => {
  const signer = createEd25519Signer(secret, X402_NETWORK);
  const client = new x402Client().register(X402_NETWORK, new ExactStellarScheme(signer));
  client.registerPolicy((_version, requirements) => requirements.filter(requirement => requirement.scheme === X402_SCHEME && requirement.network === X402_NETWORK && requirement.payTo === expectedPayTo && requirement.asset === X402_USDC_CONTRACT && requirement.amount === WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT));
  client.onBeforePaymentCreation(async () => { beforePayment(); });
  client.onAfterPaymentCreation(async ({ paymentPayload }) => {
    assertSignedTransferMatches(paymentPayload, { payer: payerAddress, payTo: expectedPayTo, asset: X402_USDC_CONTRACT, amount: WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT });
  });
  return wrapFetchWithPayment(fetch, client);
} });
console.log(JSON.stringify({ ok: true, mode: "executed-one-shot", endpoint, payer: report.payer.displayed, cap: report.caps, receipt: result, secretsPrinted: false, authPayloadPrinted: false }, null, 2));
}
