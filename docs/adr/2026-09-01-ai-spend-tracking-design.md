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

**AI Gateway (Google, OpenAI, xAI, Fish Audio, Gemini TTS/transcribe).** `trackTokens`
uses the real Gateway / Models.dev `provider/model` id (`google/veo-3.1`,
`openai/gpt-image-2.6-flare`, `fish-audio/s2.1-pro`, …). Autumn already prices those
from Models.dev. Do **not** invent `custom/hyperlocalise-gpt-image-2`,
`custom/hyperlocalise-seedance-2-5`, or `custom/hyperlocalise-audio-minute`, and do
not fall back to them.

**Fal and ElevenLabs.** Those vendors are not on AI Gateway. Models.dev has no Fal
queue or ElevenLabs native invoice. Autumn cannot look up `fal-ai/flux-2-pro` or
`eleven_v4`. Custom Autumn models, one frozen unit each:

| Autumn `model_id` | Frozen unit | Vendor list price (13 Nov 2026) | `inputCost` | `outputCost` (USD × 1e6) |
|-------------------|-------------|---------------------------------|-------------|--------------------------|
| `custom/hyperlocalise-fal-image` | 1 image | $0.03 (Fal FLUX.2 Pro, first megapixel) | 0 | 30000 |
| `custom/hyperlocalise-fal-video` | 1 video second | $0.168 (Fal Kling 3.0 Pro, audio on) | 0 | 168000 |
| `custom/hyperlocalise-elevenlabs-second` | 1 audio second | $0.0025 (ElevenLabs Music $0.15/min) | 0 | 2500 |
| `custom/hyperlocalise-elevenlabs-minute` | 1 TTS input-minute | $0.08 (ElevenLabs v4 / v3 / Multilingual v2, ~$0.08/min) | 0 | 80000 |
| `custom/hyperlocalise-elevenlabs-dubbing` | 1 source-minute | $0.50 (ElevenLabs Dubbing v1, no watermark; iris calls `/v1/dubbing`) | 0 | 500000 |

Sources: [Fal FLUX.2 Pro](https://fal.ai/models/fal-ai/flux-2-pro), [Fal Kling 3.0 Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video), [ElevenLabs API pricing](https://elevenlabs.io/pricing/api).

Spread the markup can absorb on one Fal-image / Fal-video ID: Fal schnell $0.003/MP, Seedream v4.5 $0.04/image, Bria RMBG $0.018/image; Seedance 2.5 ~$0.473/s at 720p, MiniMax H3 $0.13/s at 2K, Sync lipsync $3/min ($0.05/s). ElevenLabs SFX is $0.12/min ($0.002/s) vs Music $0.15/min. Split later with new IDs. Never change a custom model's unit after usage exists. `custom/hyperlocalise-elevenlabs-audio` is retired.

Customer markup lives on the AI credit-system configuration, not in go-svc.

Organization LLM keys (`organization_llm_provider_credentials`) skip the `ai_tokens` debit
only for that language-model call. They do not pay Fal or ElevenLabs. Platform `FAL_KEY`
and `ELEVENLABS_API_KEY` always consume AI credit. Org-owned Fal or ElevenLabs keys do not
exist yet; when they do, skip the debit only when that job's vendor is the org's key.

## Runtime configuration

- `AI_CREDIT_FAL_IMAGE_MODEL_ID`
- `AI_CREDIT_FAL_VIDEO_MODEL_ID`
- `AI_CREDIT_ELEVENLABS_SECOND_MODEL_ID`
- `AI_CREDIT_ELEVENLABS_MINUTE_MODEL_ID`
- `AI_CREDIT_ELEVENLABS_DUBBING_MODEL_ID`
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
