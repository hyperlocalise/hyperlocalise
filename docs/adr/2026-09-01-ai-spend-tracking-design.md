# AI Spend Tracking Design

## Status

Accepted

## Decision

Keep the existing Autumn feature ID `ai_tokens`, but configure it as a USD-denominated
`ai_credit_system`.

Managed language, image, and video generation consume this balance through Autumn's
`trackTokens` endpoint after the work completes. The app sends the model ID plus actual
input and output tokens. Autumn prices the event. Organization-provided model credentials
are recorded locally with a zero-dollar charge and do not consume Hyperlocalise AI credit.

Do not estimate USD locally and do not reserve or check Autumn credit before generation.

## Autumn configuration

Configure standard language models by their Models.dev-compatible `provider/model` IDs.

Models.dev publishes token pricing for `openai/gpt-image-2`. Track the real input/output token
usage reported by AI SDK against that standard model ID.

Keep custom models only for modalities without published token pricing or when a provider omits
usage:

- `custom/hyperlocalise-gpt-image-2`: fallback where one output token equals one generated image.
- `custom/hyperlocalise-seedance-2-5`: one output token equals one generated video second.

Autumn requires both custom-model rates. Set `inputCost` to `0`; set `outputCost` to the
provider cost for one synthetic unit multiplied by `1,000,000`. Apply customer markup in the
AI credit-system configuration.

Every priced media variant must have a distinct custom model ID. Do not change a custom
model's unit semantics after usage has been recorded.

## Runtime configuration

- `AI_CREDIT_IMAGE_MODEL_ID`
- `AI_CREDIT_VIDEO_MODEL_ID`
- `AI_CREDIT_PRICING_VERSION`

Job-count meters (`translation_jobs`, `agent_runs`) still use `balances.track`. AI credit
uses `trackTokens` only.

## Retry policy

`trackTokens` has no documented idempotency key. A timeout or process interruption must not
be retried automatically. Reconcile the event using its operation key and provider generation
reference before resubmission.

## CLI and sandbox translation

Local `hl run` on a user's machine stays display-only. The CLI writes token totals to
`--output` JSON; those totals are not sent to Autumn.

Managed cloud sandbox translation bills the same `ai_tokens` credit as web chat:

1. File, email, and provider-agent file workflows append `--output` / `--output-detail summary`
   to `hl run` and parse the report after the process exits.
2. Completion still meters `translation_jobs` (one job). When the CLI report has tokens,
   `completeAndTrackBillableUsage` also tracks `ai_tokens` through `trackTokens`.
3. Organization-provided sandbox credentials (BYOK) record `$0` and skip the Autumn debit.

Image and video file jobs do not use CLI token reports. They track actual or synthetic
token units after generation.
