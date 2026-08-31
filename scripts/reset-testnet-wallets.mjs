import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  chmodSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

const REQUIRED_FLAG = "--i-understand-testnet-wallet-reset";
const SECRET_FILE = ".env.x402.local";
const AUTO_LOADED_FILE = ".env.local";
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";
// Circle's classic Stellar Testnet USDC issuer (the SEP-41 contract is derived from this asset).
const USDC_TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const WALLET_KEYS = new Set([
  "X402_PAYER_ADDRESS",
  "X402_PAYER_SECRET",
  "X402_SELLER_ADDRESS",
  "X402_SELLER_SECRET",
]);

if (process.argv.length !== 3 || process.argv[2] !== REQUIRED_FLAG) {
  console.error(`Refusing to reset wallets. Re-run with exactly: ${REQUIRED_FLAG}`);
  process.exit(2);
}

if (!existsSync(SECRET_FILE)) {
  throw new Error(`${SECRET_FILE} is required so facilitator configuration can be preserved.`);
}

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

const original = readFileSync(SECRET_FILE, "utf8");
const originalValues = parseEnv(original);
for (const name of ["STELLAR_X402_FACILITATOR_URL", "STELLAR_X402_FACILITATOR_API_KEY"]) {
  if (!originalValues.has(name)) throw new Error(`${name} is missing; refusing to discard facilitator configuration.`);
}

const payer = Keypair.random();
const seller = Keypair.random();
const server = new Horizon.Server(HORIZON_URL);
const usdc = new Asset("USDC", USDC_TESTNET_ISSUER);

async function fundWithOfficialFriendbot(publicKey) {
  const url = new URL(FRIENDBOT_URL);
  url.searchParams.set("addr", publicKey);
  const response = await fetch(url, { method: "GET", redirect: "error" });
  if (!response.ok) throw new Error(`Official Friendbot rejected ${publicKey}: HTTP ${response.status}.`);
  const receipt = await response.json();
  return typeof receipt.hash === "string" ? receipt.hash : "not-returned";
}

async function createUsdcTrustline(keypair) {
  const account = await server.loadAccount(keypair.publicKey());
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(30)
    .build();
  transaction.sign(keypair);
  const receipt = await server.submitTransaction(transaction);
  return receipt.hash;
}

function replaceWalletEntries(text) {
  const retained = text
    .split(/\r?\n/)
    .filter((line) => {
      const separator = line.indexOf("=");
      return separator < 1 || !WALLET_KEYS.has(line.slice(0, separator));
    })
    .filter((line, index, lines) => line !== "" || index !== lines.length - 1);
  return [
    ...retained,
    `X402_PAYER_ADDRESS=${payer.publicKey()}`,
    `X402_PAYER_SECRET=${payer.secret()}`,
    `X402_SELLER_ADDRESS=${seller.publicKey()}`,
    `X402_SELLER_SECRET=${seller.secret()}`,
    "",
  ].join("\n");
}

function scrubAutoLoadedWalletSecrets() {
  if (!existsSync(AUTO_LOADED_FILE)) return false;
  const before = readFileSync(AUTO_LOADED_FILE, "utf8");
  const after = before
    .split(/\r?\n/)
    .filter((line) => !/^X402_(PAYER_SECRET|SELLER_SECRET)=/.test(line))
    .join("\n");
  if (after === before) return false;
  writeFileSync(AUTO_LOADED_FILE, after, { encoding: "utf8", mode: 0o600 });
  chmodSync(AUTO_LOADED_FILE, 0o600);
  return true;
}

let tempFile;
try {
  const payerFundingHash = await fundWithOfficialFriendbot(payer.publicKey());
  const sellerFundingHash = await fundWithOfficialFriendbot(seller.publicKey());
  const payerTrustlineHash = await createUsdcTrustline(payer);
  const sellerTrustlineHash = await createUsdcTrustline(seller);

  tempFile = `${SECRET_FILE}.reset-${process.pid}.tmp`;
  writeFileSync(tempFile, replaceWalletEntries(original), { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(tempFile, 0o600);
  writeFileSync(SECRET_FILE, readFileSync(tempFile), { mode: 0o600 });
  chmodSync(SECRET_FILE, 0o600);
  unlinkSync(tempFile);
  tempFile = undefined;
  const autoLoadedSecretsScrubbed = scrubAutoLoadedWalletSecrets();

  console.log(JSON.stringify({
    ready: true,
    network: "stellar:testnet",
    payerAddress: payer.publicKey(),
    sellerAddress: seller.publicKey(),
    transactions: {
      payerFriendbot: payerFundingHash,
      sellerFriendbot: sellerFundingHash,
      payerUsdcTrustline: payerTrustlineHash,
      sellerUsdcTrustline: sellerTrustlineHash,
    },
    facilitatorConfigurationPreserved: true,
    secretStorage: SECRET_FILE,
    secretPrinted: false,
    autoLoadedSecretsScrubbed,
    usdcFunded: false,
    paymentAttempted: false,
  }, null, 2));
} catch (error) {
  if (tempFile && existsSync(tempFile)) unlinkSync(tempFile);
  const status = Number(error?.response?.status) || Number(error?.status) || undefined;
  console.error(JSON.stringify({ ready: false, stage: "testnet-wallet-reset", status }, null, 2));
  process.exitCode = 1;
}
