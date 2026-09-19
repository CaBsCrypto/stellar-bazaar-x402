import { inspectPilotTransaction } from "./lib/private-pilot-chain.mjs";
import { assertPilotPaymentChallenge } from "./lib/private-pilot-challenge.mjs";
// One controlled Testnet purchase, durable local recovery, private Redis history. Never print credentials.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  selectedEnv,
  writePrivateJSON,
  readPrivateJSON,
  acquirePilotLock,
  markPaymentAttempt,
  releaseDeadPilotLock,
} from "./lib/private-pilot-state.mjs";
import {
  buildWebsiteReportBundle,
  persistWebsiteReport,
} from "../lib/website-intelligence-history.ts";
import { appendActivity } from "../lib/activity-client.ts";
import {
  verifiedWebsiteIntelligenceDelivery,
  WEBSITE_INTELLIGENCE_PUBLIC_BASE_URL,
} from "../lib/website-intelligence-consumption.ts";
import {
  executeWebsiteIntelligenceOneShot,
  prepareWebsiteIntelligenceOneShot,
  requestWebsiteIntelligencePaymentChallenge,
} from "../lib/website-intelligence-one-shot.ts";
import {
  canonicalInputHash,
  canonicalServiceCardHash,
  reconcileWebsiteIntelligenceSettlement,
  WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT,
  WEBSITE_INTELLIGENCE_ROUTE,
} from "../lib/website-intelligence-readiness.ts";
import {
  recoveryProofForToken,
  createPrivateRecoveryCapsule,
  createProviderRecoveryRequest,
} from "../lib/delivery-recovery-handoff.ts";
import {
  X402_NETWORK,
  X402_SCHEME,
  X402_USDC_CONTRACT,
} from "../lib/x402-config.ts";
import { authenticateHistory } from "../lib/operation-history-auth.ts";
const directory = resolve("work/private-website-report-pilot"),
  accessPath = join(directory, "access.json"),
  runPath = join(directory, "run.json");
const baseUrl = "http://127.0.0.1:3214",
  providerOrigin = WEBSITE_INTELLIGENCE_PUBLIC_BASE_URL;
const command = process.argv[2],
  hash = (value) => createHash("sha256").update(value).digest("hex");
const publicKeys = [
  "X402_PAYER_ADDRESS",
  "X402_SELLER_ADDRESS",
  "WEBSITE_INTELLIGENCE_APPROVED_PAY_TO",
  "WEBSITE_INTELLIGENCE_APPROVED_CARD_HASH",
];
const redisKeys = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];
function access() {
  if (!existsSync(accessPath)) throw Error("RUN_SETUP_FIRST");
  return readPrivateJSON(accessPath);
}
function accountConfig(credentials) {
  return JSON.stringify([
    {
      ownerId: credentials.ownerId,
      readTokenHash: hash(credentials.readToken),
      writeTokenHash: hash(credentials.writeToken),
    },
    {
      ownerId: credentials.otherOwnerId,
      readTokenHash: hash(credentials.otherReadToken),
      writeTokenHash: hash(credentials.otherWriteToken),
    },
  ]);
}
function initials(run, mode) {
  return [
    {
      kind: "task-started",
      title: "Consultar Website Intelligence · piloto privado",
    },
    { kind: "service-selected", title: "Website Intelligence seleccionado" },
    {
      kind: "request-started",
      title:
        mode === "mock"
          ? "Importar informe de prueba · sin compra"
          : "Solicitud Testnet · análisis con datos de prueba",
    },
  ].map((item, index) => ({
    ...item,
    eventId: run.operationId + ":initial-" + index,
    operationId: run.operationId,
    taskId: run.taskId,
    agentId: run.agentId,
    mode,
  }));
}
async function journal(run, mode) {
  const a = access();
  const bundle = buildWebsiteReportBundle({
    operationId: run.operationId,
    taskId: run.taskId,
    agentId: run.agentId,
    mode,
    providerOrigin,
    payTo: run.payTo,
    result: run.result,
    transactionHash: run.transactionHash,
  });
  bundle.events = [...initials(run, mode), ...bundle.events];
  return persistWebsiteReport(baseUrl, a.writeToken, bundle);
}
async function balances(address) {
  const { Horizon } = await import("@stellar/stellar-sdk");
  const account = await new Horizon.Server(
    "https://horizon-testnet.stellar.org",
  ).loadAccount(address);
  const balance = account.balances.find(
    (b) =>
      b.asset_code === "USDC" &&
      b.asset_issuer ===
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  );
  const native = account.balances.find((b) => b.asset_type === "native");
  if (!balance || !native || Number(native.balance) <= 1)
    throw Error("TESTNET_BALANCE_OR_RESERVE_MISSING");
  const [whole, fraction = ""] = balance.balance.split(".");
  return {
    atomic: (
      BigInt(whole) * 10000000n +
      BigInt(fraction.padEnd(7, "0"))
    ).toString(),
    ledger: Number(account.last_modified_ledger),
  };
}
async function publicPreflight(run) {
  const env = selectedEnv(".env.x402.local", publicKeys),
    cardUrl = providerOrigin + "/v1/service-card";
  const response = await fetch(cardUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("PROVIDER_CARD_UNAVAILABLE");
  const card = await response.json(),
    cardHash = canonicalServiceCardHash(card),
    payTo = env.WEBSITE_INTELLIGENCE_APPROVED_PAY_TO || env.X402_SELLER_ADDRESS,
    payer = env.X402_PAYER_ADDRESS;
  const configuredHash = env.WEBSITE_INTELLIGENCE_APPROVED_CARD_HASH;
  if (card.payment?.payTo !== payTo) throw Error("SELLER_MISMATCH");
  if (
    card.payment?.binding?.cardHash !== cardHash ||
    (configuredHash && configuredHash !== cardHash)
  )
    throw Error("CARD_HASH_MISMATCH");
  if (
    run &&
    (run.cardHash !== cardHash || run.payTo !== payTo || run.payer !== payer)
  )
    throw Error("PREFLIGHT_CHANGED");
  const requestBody = run?.requestBody ?? {
      language: "es",
      url: "https://example.com",
    },
    operationId =
      run?.operationId ?? "website-pilot-" + randomBytes(12).toString("hex");
  const recoveryToken =
      run?.recoveryToken ?? randomBytes(32).toString("base64url"),
    requestId = run?.requestId ?? randomBytes(16).toString("hex"),
    proof = await recoveryProofForToken(recoveryToken);
  const before = await balances(payer),
    sellerBefore = await balances(payTo);
  const expected = {
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    asset: X402_USDC_CONTRACT,
    payTo,
    amount: WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT,
    method: "POST",
    route: WEBSITE_INTELLIGENCE_ROUTE,
    inputHash: canonicalInputHash(requestBody),
    cardHash,
  };
  const report = await prepareWebsiteIntelligenceOneShot(
    {
      card,
      sourceUrl: cardUrl,
      expectedPayTo: payTo,
      payerAddress: payer,
      requestBody,
      idempotencyKey: operationId,
      approvedCardHash: cardHash,
      executeRequested: false,
      explicitOneShotAcknowledgement: false,
    },
    { getBalance: async () => before },
  );
  if (
    !report.readiness.ready ||
    !report.payer.valid ||
    !report.balance.sufficient
  )
    throw Error("PREFLIGHT_FAILED");
  await requestWebsiteIntelligencePaymentChallenge({
    requestBody,
    idempotencyKey: operationId,
    localBaseUrl: providerOrigin,
    expectedPayTo: payTo,
    approvedCardHash: cardHash,
    publicResourceUrl: providerOrigin + WEBSITE_INTELLIGENCE_ROUTE,
    recoveryIntent: { requestId, proof },
  });
  return {
    ...run,
    version: "website-report-pilot/v1",
    operationId,
    taskId: run?.taskId ?? operationId,
    agentId: "website-intelligence-pilot",
    payTo,
    payer,
    cardHash,
    requestBody,
    expected,
    recoveryToken,
    requestId,
    proof,
    before,
    sellerBefore,
    status: run?.status ?? "prepared",
    paymentAttempted: run?.paymentAttempted ?? false,
  };
}
function acceptDeliveredBody(run, body) {
  if (
    !body ||
    !body.receipt ||
    canonicalInputHash(body.result) !== body.resultHash
  )
    throw Error("DELIVERY_HASH_MISMATCH");
  const reconciled = reconcileWebsiteIntelligenceSettlement(
    body.receipt,
    run.expected,
    body.result,
    body.resultHash,
  );
  const recoveryId = canonicalInputHash({
    requestId: run.requestId,
    proof: run.proof,
    inputHash: run.expected.inputHash,
    cardHash: run.cardHash,
  });
  if (
    !reconciled.reconciled ||
    body.recovery?.requestId !== run.requestId ||
    body.recovery?.recoveryId !== recoveryId
  )
    throw Error("DELIVERY_RECONCILIATION_FAILED");
  run.result = body.result;
  run.receipt = body.receipt;
  run.transactionHash = body.receipt.transactionHash;
  run.resultHash = body.resultHash;
  run.status = "received";
  writePrivateJSON(runPath, run);
}
async function storeRun(run) {
  if (!run.result || !run.transactionHash)
    throw Error("NO_RECEIVED_RESULT_USE_RECOVER");
  const saved = await journal(run, "testnet");
  run.storage = saved;
  run.status = saved.status === "stored" ? "stored" : "storage-pending";
  writePrivateJSON(runPath, run);
  return saved;
}
async function execute(run) {
  if (
    !process.argv.includes("--acknowledge-exactly-one-payment") ||
    !process.argv.includes("--acknowledge-testnet-10000-atomic")
  )
    throw Error("EXPLICIT_ONE_SHOT_FLAGS_REQUIRED");
  if (run.paymentAttempted)
    throw Error("PAYMENT_ALREADY_ATTEMPTED_USE_RECOVERY_OR_STORE");
  run = await publicPreflight(run);
  writePrivateJSON(runPath, run);
  const credentials = access();
  for (const event of initials(run, "testnet"))
    if (
      (await appendActivity(
        baseUrl,
        { writeToken: credentials.writeToken },
        event,
      )) !== "recorded"
    )
      throw Error("PRIVATE_HISTORY_UNAVAILABLE_BEFORE_PAYMENT");
  const secrets = selectedEnv(".env.x402.local", ["X402_PAYER_SECRET"]);
  const secret = secrets.X402_PAYER_SECRET;
  if (!secret) throw Error("PAYER_SECRET_NOT_CONFIGURED");
  const { assertActiveTestnetPayerSecret } = await import(
    "../lib/testnet-payer-safety.ts"
  );
  if (assertActiveTestnetPayerSecret(secret) !== run.payer)
    throw Error("PAYER_IDENTITY_MISMATCH");
  const { Address, Networks, Transaction, scValToNative, Horizon } =
    await import("@stellar/stellar-sdk");
  const { x402Client } = await import("@x402/core/client");
  const { wrapFetchWithPayment } = await import("@x402/fetch");
  const { createEd25519Signer } = await import("@x402/stellar");
  const { ExactStellarScheme } = await import("@x402/stellar/exact/client");
  const result = await executeWebsiteIntelligenceOneShot({
    endpoint: providerOrigin + WEBSITE_INTELLIGENCE_ROUTE,
    requestBody: run.requestBody,
    idempotencyKey: run.operationId,
    expected: run.expected,
    acknowledgementOne: true,
    acknowledgementTwo: true,
    balanceAtomic: run.before.atomic,
    recoveryIntent: { requestId: run.requestId, proof: run.proof },
    createPaidFetch: (beforePayment) => {
      const client = new x402Client()
        .setSpendControls({
          allowedAssets: [
            {
              network: X402_NETWORK,
              asset: X402_USDC_CONTRACT,
              maxAmountPerPayment: "10000",
            },
          ],
        })
        .register(
          X402_NETWORK,
          new ExactStellarScheme(createEd25519Signer(secret, X402_NETWORK)),
        );
      client.registerPolicy((_version, requirements) =>
        requirements.filter(
          (r) =>
            r.network === X402_NETWORK &&
            r.scheme === X402_SCHEME &&
            r.asset === X402_USDC_CONTRACT &&
            r.payTo === run.payTo &&
            r.amount === "10000",
        ),
      );
      client.onBeforePaymentCreation(async (context) => {
        assertPilotPaymentChallenge(context, run);
        beforePayment();
        markPaymentAttempt(runPath, run);
      });
      client.onAfterPaymentCreation(async ({ paymentPayload }) => {
        const tx = new Transaction(
          paymentPayload?.payload?.transaction,
          Networks.TESTNET,
        );
        if (tx.operations.length !== 1)
          throw Error("SIGNED_OPERATION_MISMATCH");
        const op = tx.operations[0];
        if (
          op.type !== "invokeHostFunction" ||
          op.func.switch().name !== "hostFunctionTypeInvokeContract"
        )
          throw Error("SIGNED_OPERATION_MISMATCH");
        const invocation = op.func.invokeContract(),
          args = invocation.args();
        if (
          invocation.functionName().toString() !== "transfer" ||
          args.length !== 3 ||
          Address.fromScAddress(invocation.contractAddress()).toString() !==
            run.expected.asset ||
          String(scValToNative(args[0])) !== run.payer ||
          String(scValToNative(args[1])) !== run.payTo ||
          BigInt(scValToNative(args[2])) !== 10000n
        )
          throw Error("SIGNED_TRANSFER_MISMATCH");
      });
      const paid = wrapFetchWithPayment(fetch, client);
      return async (url, init) => {
        const response = await paid(url, init);
        const raw = await response.clone().text();
        writePrivateJSON(join(directory, "provider-response.json"), {
          status: response.status,
          body: raw,
          paymentResponse: response.headers.get("payment-response"),
        });
        return response;
      };
    },
  });
  run.result = result.result;
  run.receipt = result.receipt;
  run.envelope = result.envelope;
  run.resultHash = result.resultHash;
  run.transactionHash = result.transactionHash;
  run.status = "received";
  writePrivateJSON(runPath, run);
  const saved = await storeRun(run);
  let chain = { transactionSuccessful: false };
  try {
    const tx = await new Horizon.Server("https://horizon-testnet.stellar.org")
      .transactions()
      .transaction(result.transactionHash)
      .call();
    const payerAfter = await balances(run.payer),
      sellerAfter = await balances(run.payTo);
    chain = {
      ...inspectPilotTransaction(tx, run),
      payerDeltaAtomic: (
        BigInt(payerAfter.atomic) - BigInt(run.before.atomic)
      ).toString(),
      sellerDeltaAtomic: (
        BigInt(sellerAfter.atomic) - BigInt(run.sellerBefore.atomic)
      ).toString(),
    };
    run.chain = chain;
    writePrivateJSON(runPath, run);
  } catch {}
  return {
    ok: saved.status === "stored",
    network: X402_NETWORK,
    amount: "0.001 USDC",
    operationId: run.operationId,
    transactionHash: run.transactionHash,
    storage: saved.status,
    chain,
    paymentAttempts: 1,
    view: baseUrl + "/history",
  };
}
async function main() {
  if (command === "setup") {
    if (!existsSync(accessPath)) {
      const id = randomBytes(10).toString("hex");
      writePrivateJSON(accessPath, {
        ownerId: "website-pilot-" + id,
        readToken: randomBytes(32).toString("base64url"),
        writeToken: randomBytes(32).toString("base64url"),
        otherOwnerId: "website-other-" + id,
        otherReadToken: randomBytes(32).toString("base64url"),
        otherWriteToken: randomBytes(32).toString("base64url"),
      });
    }
    const a = access();
    authenticateHistory("Bearer " + a.readToken, false, accountConfig(a));
    writeFileSync(
      join(directory, "human-read-access.txt"),
      a.readToken + "\n",
      { mode: 0o600 },
    );
    return {
      ok: true,
      ownerId: a.ownerId,
      readAccessFile: join(directory, "human-read-access.txt"),
      view: baseUrl + "/history",
      tokensPrinted: false,
    };
  }
  if (command === "serve") {
    const credentials = access();
    const redis = selectedEnv(".env.local", redisKeys);
    const child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        "3214",
      ],
      {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          ...redis,
          BAZAAR_HISTORY_ACCOUNTS_JSON: accountConfig(credentials),
        },
      },
    );
    process.on("SIGINT", () => child.kill("SIGINT"));
    child.on("exit", (code) => {
      process.exitCode = code ?? 0;
    });
    return;
  }
  if (command === "status") {
    const run = existsSync(runPath) ? readPrivateJSON(runPath) : null;
    return {
      prepared: !!run,
      paymentAttempted: run?.paymentAttempted ?? false,
      status: run?.status,
      operationId: run?.operationId,
      transactionHash: run?.transactionHash,
      storage: run?.storage?.status,
      view: baseUrl + "/history",
    };
  }
  if (["store", "recover"].includes(command)) releaseDeadPilotLock(directory);
  const release = acquirePilotLock(directory);
  try {
    if (command === "fixture") {
      const a = access();
      const run = {
        operationId: a.ownerId + "-fixture",
        taskId: a.ownerId + "-fixture",
        agentId: "website-intelligence-pilot",
        payTo: "GAHOZFSDG2DW32FOUUP6XA4SMN3OCR7NOUXHAPYFN47BLJX56GJ3WCSM",
        result: verifiedWebsiteIntelligenceDelivery.result,
      };
      const saved = await journal(run, "mock");
      return {
        ok: saved.status === "stored",
        storage: saved.status,
        operationId: run.operationId,
        mode: "mock",
        paymentAttempted: false,
      };
    }
    if (command === "preflight") {
      access();
      const current = existsSync(runPath)
        ? readPrivateJSON(runPath)
        : undefined;
      if (current?.paymentAttempted)
        throw Error("PAYMENT_ALREADY_ATTEMPTED_USE_RECOVERY_OR_STORE");
      const run = await publicPreflight(current);
      writePrivateJSON(runPath, run);
      return {
        ok: true,
        provider: providerOrigin,
        network: X402_NETWORK,
        amount: "0.001 USDC",
        cardHash: run.cardHash,
        paymentAttempted: false,
        signerCreated: false,
        operationId: run.operationId,
      };
    }
    if (command === "verify") {
      const run = readPrivateJSON(runPath);
      if (!run.result || !run.transactionHash)
        throw Error("NO_DELIVERY_TO_VERIFY");
      const { Horizon } = await import("@stellar/stellar-sdk");
      const tx = await new Horizon.Server("https://horizon-testnet.stellar.org")
        .transactions()
        .transaction(run.transactionHash)
        .call();
      const evidence = inspectPilotTransaction(tx, run);
      run.chain = { ...run.chain, ...evidence };
      writePrivateJSON(runPath, run);
      return { ...evidence, paymentAttempted: false };
    }
    const run = readPrivateJSON(runPath);
    if (command === "execute") return await execute(run);
    if (command === "store") {
      const result = await storeRun(run);
      return {
        ok: result.status === "stored",
        storage: result.status,
        operationId: run.operationId,
        paymentAttempted: false,
      };
    }
    if (command === "recover") {
      if (!run.paymentAttempted) throw Error("NO_PAYMENT_ATTEMPT_TO_RECOVER");
      if (run.result) {
        const result = await storeRun(run);
        return {
          ok: result.status === "stored",
          storage: result.status,
          paymentAttempted: false,
        };
      }
      const backup = join(directory, "provider-response.json");
      if (existsSync(backup)) {
        try {
          const local = readPrivateJSON(backup);
          if (local.status === 200)
            acceptDeliveredBody(run, JSON.parse(local.body));
        } catch {}
      }
      if (!run.result) {
        const capsule = createPrivateRecoveryCapsule({
          serviceId: "website-intelligence",
          providerOrigin,
          recoveryPath: "/v1/x402/audits/recover",
          requestId: run.requestId,
          recoveryToken: run.recoveryToken,
        });
        const recoveryId = canonicalInputHash({
          requestId: run.requestId,
          proof: run.proof,
          inputHash: run.expected.inputHash,
          cardHash: run.cardHash,
        });
        const response = await fetch(
          providerOrigin + "/v1/x402/audits/recover",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              createProviderRecoveryRequest(capsule, recoveryId),
            ),
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok)
          throw Error("PROVIDER_RECOVERY_NOT_AVAILABLE_NO_REPAYMENT");
        acceptDeliveredBody(run, await response.json());
      }
      const result = await storeRun(run);
      return {
        ok: result.status === "stored",
        storage: result.status,
        operationId: run.operationId,
        paymentAttempted: false,
      };
    }
    throw Error(
      "COMMAND_REQUIRED_SETUP_SERVE_FIXTURE_PREFLIGHT_EXECUTE_STORE_RECOVER_STATUS",
    );
  } finally {
    release();
  }
}
main()
  .then((result) => {
    if (result) console.log(JSON.stringify(result));
  })
  .catch((error) => {
    const code = /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "PILOT_UNAVAILABLE";
    console.error(
      JSON.stringify({
        ok: false,
        error: code,
        next: "status; use store/recover after any payment attempt. Never repeat payment for a journal failure.",
        secretsPrinted: false,
      }),
    );
    process.exitCode = 1;
  });
