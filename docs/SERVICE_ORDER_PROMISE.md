# Service order, buyer brief, and promise summary

`bazaar.service-order/v1` describes a buyer-owned **brief**, not a payment authorization. A brief carries the objective, provider inputs, success criteria, constraints, optional deadline, locale, explicit data-consent acknowledgement, and an idempotency key.

Providers declare a delivery promise separately: sync or async delivery, expected duration, output kinds and schema, retention, and revision terms. Every revision policy states included revisions, revision window, response SLA, scope-change rule, and a provider-declared refund policy.

The status machine is `draft → accepted → processing → delivered → accepted-by-buyer`, with bounded `revision-requested`, `failed`, `cancelled`, and `expired` paths. It is a provider/buyer coordination contract only. It does not settle payment, decide quality, custody funds, or create escrow.

Bazaar renders a **Promise Summary** before a buyer acts. Pilot values are provider-reported and payment-inactive. Website Intelligence models synchronous delivery; Video Repurpose and Brand Identity model asynchronous delivery.
