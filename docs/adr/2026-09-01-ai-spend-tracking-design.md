# AI Spend Tracking Design

## Status

Accepted

## Decision

Keep the existing Autumn feature ID `ai_tokens`, but configure it as a USD-denominated
`ai_credit_system`.

Managed language, image, and video generation consume this balance through Autumn's
`trackTokens` endpoint. Organization-provided model credentials are recorded locally with a
zero-dollar charge and do not consume Hyperlocalise AI credit.

Free and Growth plans stop before managed generation when credit is insufficient. Enterprise
may exceed its grant only when Autumn returns `overageAllowed`.

## Autumn configuration

Configure standard language models by their Models.dev-compatible `provider/model` IDs.

Configure media as custom models with synthetic output-token units:

- `custom/hyperlocalise-gpt-image-2`: one output token equals one generated image.
- `custom/hyperlocalise-seedance-2-5`: one output token equals one generated video second.

Autumn requires both custom-model rates. Set `inputCost` to `0`; set `outputCost` to the
provider cost for one synthetic unit multiplied by `1,000,000`. Apply customer markup in the
AI credit-system configuration.

Every priced media variant must have a distinct custom model ID. Do not change a custom
model's unit semantics after usage has been recorded.

## Runtime configuration

- `AI_CREDIT_METERING_MODE=legacy|shadow|enforced`
- `AI_CREDIT_CHAT_RESERVATION_USD`
- `AI_CREDIT_IMAGE_PRICE_USD`
- `AI_CREDIT_VIDEO_PRICE_USD_PER_SECOND`
- `AI_CREDIT_IMAGE_MODEL_ID`
- `AI_CREDIT_VIDEO_MODEL_ID`
- `AI_CREDIT_PRICING_VERSION`

`legacy` preserves raw-token tracking while Autumn products are migrated. `shadow` records
the new ledger without debiting Autumn. `enforced` checks the remote balance and settles
usage through `trackTokens`.

Switch the Autumn feature and application mode together. The legacy `balances.track` path
must not write to `ai_tokens` after the feature becomes an AI credit system.

## Preflight and concurrency

Autumn does not document composing AI `trackTokens` with balance-lock finalization. The app
therefore uses an organization-scoped Postgres advisory lock and local outstanding
reservations:

1. Read the Autumn balance.
2. Add local unsettled reservations to the required amount.
3. Reject when the combined amount exceeds available credit.
4. Insert the local reservation before releasing the advisory lock.
5. Settle actual billable units through `trackTokens`, or release the reservation if no
   provider-billable work completed.

## Retry policy

`trackTokens` has no documented idempotency key. The ledger enters `settlement_unknown`
before dispatch. A timeout or process interruption must not be retried automatically.
Reconcile the event using its operation key and provider generation reference before
resubmission.
