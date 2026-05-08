## 2025-05-15 - [Enhancement] Masking Secrets in Prompt Debug Logs
**Vulnerability:** API keys (OpenAI, Google, etc.) could be leaked into plaintext log files if prompt debugging (`HYPERLOCALISE_PROMPT_DEBUG`) is enabled and the prompts or outputs contain those keys.
**Learning:** Debug logging of raw LLM interactions is a common source of accidental credential exposure, especially when developers use few-shot examples or context that includes real or placeholder secrets.
**Prevention:** Implement a central sanitization helper (`maskSecrets`) that uses regex to identify and redact sensitive patterns (e.g., `sk-`, `hl_`, `AIza`) before any data is written to persistent logs.
