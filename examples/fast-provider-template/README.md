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

### 3. Validate & Publish Service
Run the automated preflight and publishing script:
```bash
node publish-service.mjs
```
Or validate via HTTP API:
```bash
curl -X POST https://stellar-bazaar-x402.vercel.app/api/conformance/service-card \
  -H "Content-Type: application/json" \
  -d @bazaar-card.json
```

### 4. Publish via Web Form
You can also paste `bazaar-card.json` directly at [https://stellar-bazaar-x402.vercel.app/publish](https://stellar-bazaar-x402.vercel.app/publish).
