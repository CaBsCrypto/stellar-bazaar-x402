# Confirmed payment replay and requirement probes

This optional acceptance step uses the first order only after its original
payment response was captured as `CONFIRMED` and its delivered order was read
through the same controller. It creates no signature, spend reservation,
provider execution, RPC request or facilitator request. Ordinary `x402:pay`
still rejects every repeated payment POST.

Before preparing/freezing the public plan, declare exactly:

```js
confirmedPaymentProbes: {
  orderIndex: 0,
  mutationTypes: ['price', 'destination', 'asset', 'network', 'content'],
  replayCalls: 1,
  tamperCallsEach: 1,
  timing: 'after-confirmed-payment-and-terminal-delivery',
}
```

Declare these six separate application profile specs, each with
`operationalProfile:'recovery'`, `maximumCalls:1`, explicit client
`maxRequestBytes`/`maxResponseBytes`, and source-derived reservations:

- `x402:confirmed-replay`
- `x402:probe:price`
- `x402:probe:destination`
- `x402:probe:asset`
- `x402:probe:network`
- `x402:probe:content`

The profiles use the current recovery source envelope, including the client's
own request and response bytes. The first challenge still requires the larger
authenticated/recovery component bounds. No order creation or eighth
authenticated operation is added by these probes.

Root's private orchestrator retains the first buyer journal and agent access
in memory from the already authorized runtime callback. Once `buy-0` is
complete, invoke:

```js
import {runOpenConfirmedPaymentProbes} from './scripts/open-confirmed-payment-probes.mjs';

const result = await runOpenConfirmedPaymentProbes({
  controller: session.controller,
  buyerJournal: firstBuyerJournal, // original encrypted intent, read only
  agentAccess: existingBuyerAccessInMemory,
});
// result contains sanitized hashes/outcomes only. Never print private runtime.
```

This helper accepts no signer or private runtime/wallet loader. Root must not
reload a wallet to run it. `bindConfirmedPaymentProbes` reads the existing paid
intent and matches its original signature/payload/receipt/transaction hashes
to the original controlled payment response, and its terminal delivery hash
to the selected controlled order read. The resulting public hash binding is
persisted once in the encrypted controller journal. A changed binding rejects.

The replay sends the exact original `payment-signature` with body `{}` to its
original frozen endpoint. It must return HTTP 200, the identical receipt and
transaction, and the same terminal delivery/order hash. Each tamper retains
the original transaction bytes and changes only one requirement: amount to
`100001`, destination to the frozen payer, asset to that payer's classic
address, network to `stellar:pubnet`, or `accepted.extra.inputHash` to a
deterministic distinct content hash. No signature is regenerated. Each must
return HTTP 402 with `X402_PAYMENT_REQUIREMENTS_MISMATCH` and no receipt/order.
This content check tests the payment's frozen input-hash binding; it does not
create an altered order or claim an order-create collision check.

Every probe reserves its full profile and controller CAS before transport and
persists its start. All observed external kinds, including facilitator, RPC
and provider, must be zero. A lost response, changed receipt/delivery or any
external activity makes uncertainty sticky and stops subsequent probes. Each
typed probe is allowed once. Raw `controller.fetch` still classifies a signed
POST as ordinary `x402:pay` and cannot bypass its no-repost guard. Roots must
retain both compact encrypted journals and the original spend reservations.

The runner accepts `existingController:session.controller` to share the
already locked controller. It checks plan/source/deployment/recovery binding
and leaves controller closing to the session owner. Without that argument it
creates/closes its own controller; its normal CLI now uses
`createOpenCompactJournal` rather than generic full snapshots.

For an existing protected provider, `createOpenProviderTransport` accepts
optional `providerProtectionAccess` only in private memory. It injects
`x-vercel-protection-bypass` solely for the exact frozen HTTPS provider origin
and route, preserves the adapter's provider Bearer credential, forbids cookies
or caller overrides, and passes through `controller.fetch` so the private
header's bytes are counted before request. It cannot send this header to
Bazaar. `runOpenAcceptanceOrder` reads this optional value from the existing
seller runtime and uses that wrapper for the single authorized provider call.

Run locally against the integrated source:

```powershell
node scripts/open-test-confirmed-payment-probes.mjs --source-root .
node scripts/open-test-acceptance-controller.mjs --source-root .
node scripts/open-test-vercel-journal.mjs
```

Fixtures perform zero remote requests, wallet reads, signatures or payments.
They verify original confirmation/terminal prerequisites, exact replay and
five mutations, no extra spend, mismatch/external uncertainty, exact provider
origin, and existing-controller ownership. They grant no hosted evidence or
independent review approval.
