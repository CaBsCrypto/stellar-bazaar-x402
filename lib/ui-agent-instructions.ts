import {selectedServiceId} from './service-selection';
// English presentation of the existing onboarding instructions. Tool names,
// protocol, authorization and recovery requirements remain the same.
export function englishBuyerInstructions(origin: string, value?: unknown): string {
  const id = selectedServiceId(value);
  const selection = id
    ? `The selected service is ${id}. Call get_service with this identifier and recheck the active card, hash, price, network, delivery and availability before creating an order. If it does not exist or is unavailable, explain why and stop. Show me the current terms and request my explicit authorization before buying; this link only selects a service and does not authorize payment.`
    : 'Find active services with list_market_services or search_services and check the card and its hash with get_service. Help me compare options.';
  return `Connect to Bazaar through MCP at ${origin}/api/mcp. Check get_bazaar_capabilities, tools/list and the buyer skill at ${origin}/skills/buyer/SKILL.md. ${selection} To buy, use my own agent access and authorized local signer: save the intent before create_market_order, keep its operationId and use x402-stellar-exact-v2 with the exact active-card price in official Stellar Testnet USDC, within my authorized budget. Verify the HTTP 402 against the card before signing. If configuration, spendable funds or authorization are missing, stop. Do not create wallets or use faucets automatically. Recover the same order with get_market_order; never repeat an uncertain payment. Do not include credentials in the prompt.`;
}
export function englishSellerInstructions(origin: string): string {
  return `Connect to Bazaar through MCP at ${origin}/api/mcp. Check get_bazaar_capabilities, tools/list and the seller skill at ${origin}/skills/seller/SKILL.md. Help me prepare a real HTTPS API, a text/plain delivery card with a positive price I choose in official Stellar Testnet USDC and x402-stellar-exact-v2, and endpoint control proof. Use only my own agent access, with market:submit granted through human access. Save submissionId, card and controlProof before submit_market_service; recover with get_market_submission without inventing another request. Publication requires verification and manual review. Execute orders only after verifying payment and retaining a stable attempt; for uncertain execution use uncertain_market_order and do not repeat the effect. Do not include credentials in the prompt.`;
}
