# Production Deployment Guide: Stellar Bazaar x402

This guide explains how to deploy **Stellar Bazaar x402** to production environments (Vercel, Cloudflare Pages/Workers, or Docker Node.js) with zero-knowledge privacy and $0 egress deliverables storage via Cloudflare R2.

---

## 1. Prerequisites & Cloud Infrastructure

### A. Cloudflare R2 (Private Deliverables Storage)
1. In Cloudflare Dashboard, navigate to **R2 Object Storage** and create a bucket named `bazaar-deliverables`.
2. Configure **Lifecycle Rules**: Set expiration to **7 days** (automatic deletion of ephemeral deliverable assets).
3. Under **Manage R2 API Tokens**, create an API token with `Object Read & Write` permissions for the bucket.
4. Note your credentials:
   - **Endpoint**: `https://<account_id>.r2.cloudflarestorage.com`
   - **Access Key ID**: `BAZAAR_S3_KEY_ID` (or `BAZAAR_S3_ACCESS_KEY_ID`)
   - **Secret Access Key**: `BAZAAR_S3_APP_KEY` (or `BAZAAR_S3_SECRET_ACCESS_KEY`)

### B. Upstash Redis (Optional for Persistence)
1. Create a serverless Redis database on [Upstash](https://upstash.com).
2. Retrieve `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

---

## 2. Environment Variables Matrix

Set the following environment variables in your deployment platform:

| Variable | Description | Required | Example |
| :--- | :--- | :---: | :--- |
| `NODE_ENV` | Environment mode | Yes | `production` |
| `BAZAAR_S3_ENDPOINT` | Cloudflare R2 S3 Endpoint | Yes | `https://<id>.r2.cloudflarestorage.com` |
| `BAZAAR_S3_BUCKET` | R2 Bucket Name | Yes | `bazaar-deliverables` |
| `BAZAAR_S3_REGION` | S3 Region | Yes | `auto` |
| `BAZAAR_S3_KEY_ID` | R2 Access Key ID | Yes | `6f38d...` |
| `BAZAAR_S3_APP_KEY` | R2 Secret Key | Yes | `a492e...` |
| `UPSTASH_REDIS_REST_URL` | Redis REST URL for Activity & History | Optional | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN`| Redis REST Token | Optional | `AX12...` |
| `BAZAAR_HISTORY_ACCOUNTS_JSON` | Static History Accounts (SHA-256 Hashes) | Optional | `[{"ownerId":"...","readTokenHash":"...","writeTokenHash":"..."}]` |

---

## 3. Deployment Steps

### Option 1: Vercel Deployment
1. Connect the GitHub repository `CaBsCrypto/stellar-bazaar-x402`.
2. Set Framework Preset to **Next.js**.
3. Add the Environment Variables from the matrix above.
4. Deploy!

### Option 2: Cloudflare Pages / Workers
1. Create a new Cloudflare Pages project linked to the GitHub repository.
2. Build command: `npm run build`
3. Output directory: `.next`
4. Add environment variables in Pages Settings.

---

## 4. Quality Gates & Continuous Integration

Every pull request is automatically verified by GitHub Actions (`.github/workflows/ci.yml`):
- `npm run typecheck`
- `npm run security:scan`
- `npm run test:history`
- `npm run test:agent-chat`
- `npm run test:webmcp:conformance`
- `npm run build`
