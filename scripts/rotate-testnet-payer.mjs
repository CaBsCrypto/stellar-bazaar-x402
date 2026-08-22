import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";

const secretFile = ".env.x402.local";
const payer = Keypair.random();
if (!existsSync(secretFile)) {
  throw new Error("No ignored local payer configuration was found to rotate.");
}

const original = readFileSync(secretFile, "utf8");
if (!/^X402_PAYER_SECRET=/m.test(original)) {
  throw new Error("The ignored payer configuration has no payer secret field.");
}

let next = original.replace(
  /^X402_PAYER_SECRET=.*$/m,
  `X402_PAYER_SECRET=${payer.secret()}`,
);
if (/^X402_PAYER_ADDRESS=/m.test(next)) {
  next = next.replace(
    /^X402_PAYER_ADDRESS=.*$/m,
    `X402_PAYER_ADDRESS=${payer.publicKey()}`,
  );
} else {
  next = `X402_PAYER_ADDRESS=${payer.publicKey()}\n${next}`;
}
writeFileSync(secretFile, next, { encoding: "utf8", mode: 0o600 });

let autoLoadedFilesScrubbed = 0;
if (existsSync(".env.local")) {
  const autoLoaded = readFileSync(".env.local", "utf8");
  const scrubbed = autoLoaded
    .split(/\r?\n/)
    .filter((line) => !/^X402_(PAYER_(ADDRESS|SECRET)|SELLER_SECRET)=/.test(line))
    .join("\n");
  if (scrubbed !== autoLoaded) {
    writeFileSync(".env.local", scrubbed, { encoding: "utf8", mode: 0o600 });
    autoLoadedFilesScrubbed = 1;
  }
}

console.log(
  JSON.stringify(
    {
      rotated: true,
      network: "stellar:testnet",
      payerAddress: payer.publicKey(),
      filesRotated: 1,
      autoLoadedFilesScrubbed,
      secretStorage: ".env.x402.local only",
      secretPrinted: false,
      funded: false,
      paymentReady: false,
    },
    null,
    2,
  ),
);
