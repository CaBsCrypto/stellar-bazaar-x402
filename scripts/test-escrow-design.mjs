import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// This is a design-level state model, not a contract implementation. It is kept
// deliberately local and free of wallet, RPC, token and network dependencies.
const terminal = new Set(["released", "refunded", "cancelled"]);
const allowed = {
  proposed: new Set(["funded", "cancelled"]),
  funded: new Set(["released", "refunded"]),
  released: new Set(),
  refunded: new Set(),
  cancelled: new Set(),
};

function transition(current, next, actor, now, expiry) {
  if (!allowed[current]?.has(next)) throw new Error("INVALID_STATE_TRANSITION");
  if (next === "funded") {
    if (actor !== "buyer") throw new Error("BUYER_AUTH_REQUIRED");
    if (now >= expiry) throw new Error("ESCROW_EXPIRED");
  }
  if (next === "released" && actor !== "buyer") throw new Error("BUYER_RELEASE_REQUIRED");
  if (next === "refunded" && actor === "buyer" && now < expiry) throw new Error("REFUND_NOT_YET_AVAILABLE");
  if (next === "refunded" && actor !== "buyer" && actor !== "provider") throw new Error("REFUND_AUTH_REQUIRED");
  return next;
}

const expiry = 100;
assert.equal(transition("proposed", "funded", "buyer", 99, expiry), "funded");
assert.equal(transition("proposed", "cancelled", "buyer", 1, expiry), "cancelled");
assert.equal(transition("funded", "released", "buyer", 2, expiry), "released");
assert.equal(transition("funded", "refunded", "buyer", 100, expiry), "refunded");
assert.throws(() => transition("proposed", "funded", "provider", 1, expiry), /BUYER_AUTH_REQUIRED/);
assert.throws(() => transition("proposed", "funded", "buyer", 100, expiry), /ESCROW_EXPIRED/);
assert.throws(() => transition("funded", "released", "provider", 2, expiry), /BUYER_RELEASE_REQUIRED/);
assert.throws(() => transition("funded", "refunded", "buyer", 99, expiry), /REFUND_NOT_YET_AVAILABLE/);
assert.throws(() => transition("released", "refunded", "buyer", 101, expiry), /INVALID_STATE_TRANSITION/);

for (const state of terminal) assert.equal(allowed[state].size, 0);

const design = readFileSync(new URL("../docs/ESCROW_TESTNET_DESIGN.md", import.meta.url), "utf8");
for (const requiredSection of [
  "## Contract boundary",
  "## Constrained state machine",
  "## Threat model and mitigations",
  "## Acceptance gates",
  "## Dependencies and sequencing",
]) {
  assert.match(design, new RegExp(requiredSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(design, /does \*\*not\*\* add\s*> Soroban code, wallets, a deployment, funds, a facilitator, or a network call\./);

console.log(JSON.stringify({
  ok: true,
  designOnly: true,
  noNetworkOrWalletDependency: true,
  terminalStatesOneWay: true,
  invalidTransitionsRejected: true,
}, null, 2));
