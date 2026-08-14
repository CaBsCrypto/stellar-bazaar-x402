# Provider onboarding / Onboarding de providers

## Provider-owned boundary

The provider owns its endpoint, pricing, destination, terms, input/output contract, lifecycle and result delivery. Bazaar stores no seeds/private keys, signs nothing, custodies nothing and does not proxy arbitrary URLs.

## Draft → validated → verified → indexed

1. Create a versioned service card with bilingual title/description/category where applicable.
2. Declare HTTP or MCP kind, route/input/output, synchronous or async-job lifecycle, network/asset/scheme/price and public destination.
3. Run deterministic conformance. Passing means shape-valid only—not safe, reputable or certified.
4. Prove the provider endpoint over HTTPS and match its observed 402/capabilities to the card.
5. Index only after policy/conformance gates. Pilot fixtures remain explicitly `pilot-not-indexed`.

Never submit wallet seeds, private keys, facilitator keys, auth payloads or customer data in a card.
