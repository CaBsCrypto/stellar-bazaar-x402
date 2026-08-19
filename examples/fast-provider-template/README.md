# ⚡ Fast Provider Starter Template

This template contains a complete, working microservice protected by the **x402 payment protocol** on **Stellar Testnet**.

## Quickstart

### 1. Start the Provider Server
```bash
node server.mjs
```
The server will start listening at `http://127.0.0.1:4020`.

### 2. Verify 402 Payment Challenge
Test the endpoint with cURL:
```bash
curl -i http://127.0.0.1:4020/v1/weather/tokyo
```

### 3. Validate Conformance (Dry-Run)
Check that `bazaar-card.json` passes all 11 deterministic Conformance Rules:
```bash
curl -X POST https://stellar-bazaar-x402.vercel.app/api/conformance/service-card \
  -H "Content-Type: application/json" \
  -d @bazaar-card.json
```

### 4. Publish to Stellar Bazaar
Publish your service to the dynamic registry:
```bash
curl -X POST https://stellar-bazaar-x402.vercel.app/api/publisher/ingest \
  -H "Content-Type: application/json" \
  -H "X-Bazaar-Provider-Key: <YOUR_SECRET>" \
  -d @bazaar-card.json
```
Or paste `bazaar-card.json` at [https://stellar-bazaar-x402.vercel.app/publish](https://stellar-bazaar-x402.vercel.app/publish).
