# Reuse an existing provider

Publish a new native marketplace card for the delivery you actually implement.
The external kit uses 0.01 USDC on Stellar testnet, x402 exact v2 and text of
1..2000 characters. Keep your previous provider card, identifier and price under
their original contracts. The marketplace payment resource is
`/api/market/orders/{operationId}/x402`; the adapter's execution route must not
charge the buyer again.

Your own trusted module implements
`execute({operationId,attemptId,input}) => Promise<{text}>`. The generic runtime
can wrap that module behind your own HTTPS domain and hosting. It locks and
fsyncs the operation before execution and returns the original frozen output
for a completed attempt. A started attempt without a result stays uncertain.

The seller agent connects to `https://bazaar.browns.studio/api/mcp` with its own
workspace Bearer. Human consent grants `market:submit`; the operator separately
verifies domain control, reviews, approves and activates the service. Bazaar does
not launch your provider or run an agent for you.

Follow [the external seller kit](EXTERNAL_SELLER_KIT.md) for card preparation,
encrypted setup, submission, execution and recovery. Its CLI supports list,
prepare, claim, execute, deliver, fail, recover, uncertain and bounded watch.
A lost provider response never triggers execution again. A lost delivery
acknowledgement permits only explicit replay of the saved text for that attempt.
Vercel is optional; configure any protection only for your own provider host.
