## 2025-05-15 - [Enhancement] Masking Secrets in Prompt Debug Logs
**Vulnerability:** API keys (OpenAI, Google, etc.) could be leaked into plaintext log files if prompt debugging (`HYPERLOCALISE_PROMPT_DEBUG`) is enabled and the prompts or outputs contain those keys.
**Learning:** Debug logging of raw LLM interactions is a common source of accidental credential exposure, especially when developers use few-shot examples or context that includes real or placeholder secrets.
**Prevention:** Implement a central sanitization helper (`maskSecrets`) that uses regex to identify and redact sensitive patterns (e.g., `sk-`, `hl_`, `AIza`) before any data is written to persistent logs.

## 2026-05-10 - [Enhancement] Implementing Standard Security Headers
**Vulnerability:** The API lacked standard security headers (e.g., `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), leaving it more exposed to MIME-type sniffing, clickjacking, and referrer information leaks.
**Learning:** Modern web frameworks like Hono often have middleware dedicated to applying these security best practices with minimal configuration, making it easy to implement defense-in-depth.
**Prevention:** Always apply a `secureHeaders` middleware to the root of the API instance to ensure consistent security policies across all endpoints.

## 2026-05-15 - [High] Broken Function Level Authorization in Agent Tools
**Vulnerability:** AI-triggered mutation tools (creating jobs, glossaries, TMs) lacked RBAC checks, allowing users with the "member" role to perform administrative actions through the chat agent that were blocked in the equivalent REST API.
**Learning:** Agent-based tool execution can bypass standard route-level middleware if the tool context does not explicitly carry and check user permissions.
**Prevention:** Include `membershipRole` in the `ToolContext` passed to all AI tools and enforce `isMutationAllowed` checks (limiting to owner/admin) within the tool execution logic.
