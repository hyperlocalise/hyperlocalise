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

## 2026-05-20 - [High] Unauthorized HTML Injection in Liquid/HTML Translations
**Vulnerability:** The Liquid and HTML parsers allowed translated segments to include raw HTML tags that were not present in the source. Since these parsers use placeholders for all original markup, any tag found in a translation segment (before placeholder expansion) is an unauthorized injection.
**Learning:** Even when a parser correctly "protects" original markup with placeholders, it must also verify that no *new* markup is introduced in the "clean" text returned by translators.
**Prevention:** Apply a `containsHTMLTag` check to all translated segments during the rendering phase. If any unauthorized tags are detected, fall back to the source text to prevent potential XSS.

## 2026-05-25 - [Enhancement] Automatic Log Redaction in pino Logger
**Vulnerability:** Accidental leakage of sensitive keys (API keys, tokens, passwords) and HTTP headers (Authorization, Cookie) into application logs when logging request/response bodies or authentication objects.
**Learning:** Centralizing redaction at the logger level using `pino`'s built-in `redact` feature provides a failsafe against developer oversight when logging complex objects that might contain secrets.
**Prevention:** Configure a global list of sensitive paths and wildcards (e.g., `*.password`, `headers["x-api-key"]`) in the root logger to ensure consistent redaction across the entire application.

## 2026-05-30 - [Enhancement] Restricting Internal Redirect Targets
**Vulnerability:** The `sanitizeReturnTo` utility prevented external open redirects but allowed redirecting back to sensitive internal authentication routes (e.g., `/auth/sign-in`, `/auth/callback`). This could be exploited to create redirect loops or target sensitive callback logic.
**Learning:** Redirect sanitizers must account for internal "restricted" paths that, while technically local, should never be the destination of a `returnTo` parameter to avoid auth flow abuse.
**Prevention:** Maintain a centralized blacklist of restricted authentication paths within the URL sanitizer and ensure it is used by all login/session redirection logic.

## 2026-06-05 - [Enhancement] Robust Webhook Signature Verification
**Vulnerability:** Webhook verification logic (Slack, WorkOS) converted request headers directly into Buffers for comparison. While `timingSafeEqual` prevents timing attacks, extremely large signature headers could cause excessive memory allocation or unexpected behavior during Buffer conversion before the equality check.
**Learning:** Defensive signature verification should include an early-exit length check against the expected hash length. This prevents unnecessary work and potential resource exhaustion from malformed or malicious headers.
**Prevention:** Always verify that the provided signature string matches the expected hex/base64 length before allocating Buffers for constant-time comparison.

## 2026-05-28 - [High] Broken Project Level Authorization in Workspace Job Routes
**Vulnerability:** Several workspace-scoped job endpoints (agent-runs, provider-actions, QA, retry, mark-failed) only verified that a job belonged to the user's organization, but did not check if the user had access to the specific project containing that job. This allowed users to access or modify jobs in projects they were not members of within the same organization (BOLA).
**Learning:** Checking for organization ownership is a baseline but often insufficient in multi-tenant apps with nested resource hierarchies (e.g., Teams/Projects). Direct lookups by ID must always incorporate the full accessibility context of the current user.
**Prevention:** Centralize resource accessibility logic into shared helpers (like `buildAccessibleJobsWhere`) and ensure these are used in every endpoint that performs a direct object lookup or modification, even when a `jobId` is provided.

## 2026-06-10 - [High] Broken Project Level Authorization in Interaction Routes
**Vulnerability:** Conversation and chat-request routes only verified organization ownership, but did not check for project-level access. This allowed users to access or create interactions for projects they were not members of within the same organization (BOLA).
**Learning:** Interactions linked to projects must inherit the same authorization constraints as the projects themselves. Any route that performs a lookup or mutation on a sub-resource must verify the user's path through the hierarchy.
**Prevention:** Implement and enforce specialized accessibility helpers (like `buildAccessibleInteractionsWhere` and `canAccessInteraction`) that explicitly account for both project-less (organization-global) and project-scoped resources.
