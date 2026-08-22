"""Read-only discovery example for Stellar Bazaar x402.

This file intentionally contains no payer seed and performs no signing or
payment. A real payer must load its Testnet-only secret from an ignored local
environment and use a receipt-reconciling client outside the LLM/tool context.
"""

import base64
import json

import requests

BAZAAR_BASE_URL = "http://127.0.0.1:3000"


def main():
    print("=" * 65)
    print("🤖 [PYTHON AGENT] Stellar Bazaar read-only discovery")
    print("=" * 65)

    query = "swap"
    print(f"\n▶ [Step 1] Searching Stellar Bazaar for '{query}'...")
    search_url = f"{BAZAAR_BASE_URL}/api/discovery/search?q={query}"
    response = requests.get(search_url, timeout=10)
    data = response.json()

    services = data.get("results", [])
    if not services:
        print("❌ No matching services found.")
        return

    target_service = services[0]
    print(f"  ✓ Discovered ID: {target_service.get('id')}")

    endpoint = (
        f"{BAZAAR_BASE_URL}/api/x402/swap-risk"
        "?pair=XLM%2FUSDC&amount=2500&side=buy"
    )
    print("\n▶ [Step 2] Inspecting the unpaid x402 challenge...")
    unpaid = requests.get(endpoint, timeout=10)
    print(f"  ✓ HTTP Status: {unpaid.status_code}")
    if unpaid.status_code != 402:
        print(f"  ⚠️ Expected HTTP 402, received {unpaid.status_code}")
        return

    required = unpaid.headers.get("PAYMENT-REQUIRED")
    challenge = (
        json.loads(base64.b64decode(required).decode("utf-8"))
        if required
        else unpaid.json()
    )
    accepts = challenge.get("accepts", [{}])[0]
    print(
        "  ✓ Challenge: "
        f"scheme={accepts.get('scheme')}, "
        f"asset={accepts.get('asset')}, amount={accepts.get('amount')}"
    )

    print("\n▶ [Step 3] Payment intentionally disabled in this example.")
    print("  ✓ No seed loaded, no authorization produced, no transaction submitted.")
    print("\n✅ Discovery + 402 inspection completed without payment.")


if __name__ == "__main__":
    main()
