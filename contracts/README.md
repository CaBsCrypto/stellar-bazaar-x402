# 🏛️ Stellar Bazaar — Soroban Smart Contracts

This directory contains the Soroban smart contracts that govern **Stellar Bazaar**:

1. **`contracts/service-registry`**: Decentralized provenance, service card hashing, lifecycle state machine, and **DeFindex Staking / Yield Distribution (85% Provider / 15% Platform)**.
2. **`contracts/fee-split-router`**: Non-custodial atomic payment splitter executing the **99% Provider / 1% Treasury** micropayment split without intermediate custody.

---

## 🧪 Unit Tests

Run all unit tests across both contracts with locked dependencies:

```bash
# Test FeeSplitRouter (3 unit tests)
cargo test --manifest-path contracts/fee-split-router/Cargo.toml --locked

# Test ServiceRegistry (7 unit tests including DeFindex Staking)
cargo test --manifest-path contracts/service-registry/Cargo.toml --locked
```

---

## 🔨 Compiling to WASM

Using Stellar CLI 27.0.0:

```bash
# 1. Build FeeSplitRouter
cd contracts/fee-split-router
stellar contract build --locked --out-dir ../out

# 2. Build ServiceRegistry
cd ../service-registry
stellar contract build --locked --out-dir ../out
```

---

## 🚀 Testnet Deployment

```bash
# Deploy FeeSplitRouter
stellar contract deploy \
  --wasm contracts/out/bazaar_fee_split_router.wasm \
  --source bazaar-deployer \
  --network testnet

# Deploy ServiceRegistry
stellar contract deploy \
  --wasm contracts/out/bazaar_service_registry.wasm \
  --source bazaar-deployer \
  --network testnet
```
