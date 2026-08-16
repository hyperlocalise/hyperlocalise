# CLI Vercel AI Gateway provider

## Date

2026-08-16

## Context

The Go CLI already talks to OpenAI-compatible hosts through a shared chat
completions client. OpenRouter, Groq, Gemini, Mistral, Ollama, and LM Studio
all use that path. The web app now defaults managed translation and the agent
to Vercel AI Gateway (`AI_GATEWAY_API_KEY`). The CLI still has no Gateway
provider, so local `run` and `eval` cannot use the same key and model IDs.

## Decision

Add `ai_gateway` as a built-in LLM provider.

| Item | Value |
|------|--------|
| Config value | `ai_gateway` |
| Required env | `AI_GATEWAY_API_KEY` |
| Optional env | `AI_GATEWAY_BASE_URL` |
| Default base URL | `https://ai-gateway.vercel.sh/v1` |
| Client | Existing OpenAI-compatible chat completions helper |
| Model IDs | Passed through unchanged (`openai/gpt-5.6-luna`, `anthropic/claude-opus-5`) |

Auth is the Gateway API key only. The CLI does not read `VERCEL_OIDC_TOKEN`.
Image localization stays OpenAI-only; this change covers text translation and
eval.

## Consequences

- Users can set `llm.profiles.<name>.provider` to `ai_gateway` and reuse the
  same `AI_GATEWAY_API_KEY` as the web app.
- Docs, the `init` template, and config validation list `ai_gateway` with the
  other providers.
