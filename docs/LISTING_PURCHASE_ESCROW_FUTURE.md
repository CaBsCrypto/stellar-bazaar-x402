# Listing, purchase, and future escrow model / Modelo futuro de listado, compra y escrow

> **Status / Estado:** product and contract-design plan only. Bazaar currently runs
> direct x402 Testnet settlement evidence and a guarded provider intake. It has no
> deployed Bazaar Service Registry contract, escrow contract, Mainnet release, or
> dispute service.

## The two connected flows / Los dos flujos conectados

### 1. Provider listing / Listado del proveedor

1. The provider prepares a Service Card and a **visual promise summary**.
2. Bazaar validates deterministic metadata and provider control under the guarded
   pilot intake.
3. An approved card can be staged and later indexed by a separate operator action.

The proposed future Service Registry would anchor the provider-controlled card
hash, version, and lifecycle events on Stellar. It would not host media, rank
services, judge quality, sign for users, or custody funds.

### 2. Buyer purchase and delivery / Compra y entrega del comprador

1. A buyer or buyer-agent discovers the card and reviews the visual promise.
2. The buyer submits a **buyer brief**: the job-specific information required for
   this purchase, such as a URL, source files, target audience, format, or desired
   style. It is not a new promise and it cannot silently change the listed terms.
3. The buyer explicitly accepts the fixed promise and payment terms.
4. A future escrow can reserve the payment; the provider can start work
   immediately after that reservation.
5. The provider returns the result plus delivery evidence. The buyer accepts it,
   requests one of the declared revisions, or opens a timed dispute.
6. On acceptance or expiry of the review window, a future escrow can release the
   provider amount and the disclosed Bazaar fee. A valid dispute freezes funds
   until the pre-declared resolution path completes.

## Visual promise summary / Resumen visual de la promesa

Every card intended for this future flow should visibly declare:

| Field / Campo | Purpose / Propósito |
| --- | --- |
| Deliverable / Entregable | What the buyer receives: e.g. JSON audit, PNG/PDF, MP4, source files. |
| Buyer brief / Brief del comprador | Required job inputs and accepted formats. |
| Delivery window / Plazo | Expected maximum duration and time zone basis. |
| Revisions / Revisiones | Count, scope, and whether a draft checkpoint exists. |
| Acceptance checks / Criterios de aceptación | Objective checks plus any buyer approval step. |
| Evidence / Evidencia | Result hash, job ID, status URL, and retention policy. |
| Review and dispute window / Ventana de revisión y disputa | How long the buyer has and allowed claim reasons. |
| Refund policy / Política de reembolso | Objective trigger, expiry behavior, and resolver. |
| Price and Bazaar fee / Precio y comisión Bazaar | Total price, asset, and any fee shown before authorization. |
| Demo / Demo | Optional sample, walkthrough, or video; never a guarantee of a future output. |

## Immediate, iterative, and long-running work / Trabajo inmediato, iterativo y de larga duración

The purchase flow stays the same; only the declared delivery checkpoints differ.

| Profile / Perfil | Example / Ejemplo | Checkpoints / Hitos |
| --- | --- | --- |
| Immediate / Inmediato | Website Intelligence | Brief → result → short review window. |
| Iterative / Iterativo | Infographic or campaign | Brief → draft → declared revision(s) → final result → review. |
| Long-running / Largo | Remotion video or architecture concept | Brief → job accepted → milestone(s) → final asset → review. |

An escrow can verify timing, state transitions, matching IDs, hashes, and whether
a response is present. It cannot decide whether a creative output is attractive,
legally usable, or strategically effective. Those claims need a clearly declared
approval rule and, if required, a human or mutually agreed resolver.

## Future contracts, intentionally small / Contratos futuros, deliberadamente pequeños

1. **Service Registry:** provider ownership, Service Card hash/version, update and
   retirement events. No discovery ranking, payments, or media storage.
2. **Limited Escrow:** one purchase, one declared asset, one buyer, one provider,
   a deadline, a receipt/evidence reference, and only release, refund, or freeze
   outcomes. A transparent Bazaar fee may be released only with a successful
   provider release.
3. **Stellar USDC SAC:** existing Stellar asset contract used by the escrow; it is
   not a Bazaar-owned contract.

Before any Mainnet use, the plan requires Testnet test coverage for authorization,
double-release prevention, deadlines, refunds, disputes, paused operation, fee
calculation, and stuck-funds recovery; then an independent external security
review. This document does not create an escrow, contract, wallet, payment, or
legal dispute process.
