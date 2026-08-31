import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const script = readFileSync("scripts/reset-testnet-wallets.mjs", "utf8");
const refused = spawnSync(process.execPath, ["scripts/reset-testnet-wallets.mjs"], {
  encoding: "utf8",
  env: { ...process.env },
});

assert.equal(refused.status, 2, "reset must fail closed without the acknowledgement flag");
assert.match(refused.stderr, /Refusing to reset wallets/);
assert.match(script, /https:\/\/friendbot\.stellar\.org/);
assert.match(script, /https:\/\/horizon-testnet\.stellar\.org/);
assert.match(script, /GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5/);
assert.match(script, /X402_\(PAYER_SECRET\|SELLER_SECRET\)/);
assert.doesNotMatch(script, /faucet\.circle\.com/);
assert.doesNotMatch(script, /Operation\.payment/);

console.log(JSON.stringify({ ok: true, explicitFlagRequired: true, friendbotOnly: true, paymentOperationAbsent: true }));
