# Localisation audit agent (lead gen)

## Goal

Offer a public localisation health check as a lead magnet. Visitors paste a URL, get a scored audit (technical + light linguistic), and unlock the full report with a verified email link. Completed teaser reports are public SEO pages. One free audit per domain; further runs require an account.

## Product

- Landing: `/[lang]/localisation-audit`
- Result: `/[lang]/localisation-audit/[domainSlug]`
- `domainSlug` is `[a-z]+(?:-[a-z]+)*` only (dots and other hostname chars become hyphens; digits stripped), plus a short stable a-z hash suffix so collapses cannot collide (`web3.io` ≠ `web.io`). Example: `stripe.com` → `stripe-com-<hash>`.
- Domain identity uses normalized hostname (lowercase, strip `www.`).
- Public result pages show the full report (score, company profile, findings, credits, linguistic notes, sampled pages). Email capture is optional for a summary delivery, not an unlock gate.
- Optional focus locales (1–2) deepen the linguistic pass when provided on first run.
- Successful reports are public and indexable.

## Architecture

Deterministic Vercel workflow (`"use workflow"` + `"use step"`):

1. Claim audit for the current attempt / mark running
2. Crawl smart sample (~10–15 URLs: homepage, locale roots, high-value nav targets). HTML pages render in a Vercel sandbox with Playwright so JavaScript sites are visible; robots.txt and sitemaps still use the SSRF-guarded HTTP fetch. The crawl creates that sandbox through `createConfiguredVercelSandbox`, the same helper as the agent workspace, so it uses the `hyperlocalise-sandbox` VCR image when the release flag and `VERCEL_SANDBOX_IMAGE` are set. Playwright and Chromium come from that image at `/tmp/hyperlocalise-browser-runtime`; the crawl does not install them at runtime.
3. Technical checks (hreflang, lang mismatches, locale URL discovery, mixed language signals)
4. Light LLM linguistic review on focus locales (sampled strings) when `OPENAI_API_KEY` is set; otherwise heuristics only
5. Score + persist teaser + full report (attempt-guarded writes)
6. Queue pending report emails for leads captured while the audit was running
7. Mark completed / failed

A second durable workflow sends the React Email report via Resend.

Public Hono routes under `/api/localisation-audit` start/retry runs, expose teaser/full report (cookie-gated), queue verified report delivery, and consume one-time email tokens.

## Abuse protection (BotID)

- `withBotId(withWorkflow(nextConfig))` in Next config.
- `src/instrumentation-client.ts` protects `POST /api/localisation-audit` and `POST /api/localisation-audit/*/unlock`.
- Server handlers call `checkBotId()` before URL/DNS checks, DB writes, workflow starts, or email sends.
- Deep Analysis must be enabled in the Vercel Firewall dashboard for production.

## Retry and progress

- Audits store `attemptNumber`, `progressStage`, `statusUpdatedAt`, and `lastAttemptAt`.
- Claim rules:
  - reuse successful audits
  - reuse active queued/running audits younger than 15 minutes
  - reclaim failed or stale queued/running audits into a new attempt
- Workflow status/report updates are guarded by `attemptNumber` so an old run cannot overwrite a newer one.
- Enqueue failures mark the audit failed (retryable) instead of leaving permanent `queued` rows.
- Public API exposes `retryable` and `progressStage`.

## Verified email unlock

- Unlock no longer sets a cookie immediately.
- `POST /:domainSlug/unlock` stores a lead with an opaque token hash (24h expiry) and:
  - queues report email when the audit already succeeded
  - keeps the lead `pending` while the audit is running, then auto-sends on completion
  - allows safe resend with a short cooldown
- Email uses React Email + Resend (existing `RESEND_*` env vars).
- `GET /:domainSlug/verify` validates the token (reusable until expiry so email link-previews cannot burn it), marks the lead verified, sets `hl_la_unlock_{domainSlug}` HttpOnly cookie, and redirects to a normalized app locale path.
- Per-domain cookies prevent unlocking one domain from unlocking another.
- Report-email enqueue failures after a successful analysis do not mark the audit failed; they throw so the workflow/step retries queueing without touching audit status.
- Transient Resend send failures throw from the report-email step (lead stays `queued`) so Workflow retries delivery. Permanent configuration / readiness failures mark the lead `failed` and return without retry.

## Analytics

- Typed `Analytics` class under `src/lib/analytics` wraps `@vercel/analytics` (client/server) and Google Analytics (`sendGAEvent` on the client, Measurement Protocol on the server).
- Funnel events: start, reuse, retry, completed, failed, teaser view, report-email request/sent, email verified, CTA click.
- Properties are limited to two low-cardinality, non-PII keys. Never send email, domain, URL, free text, or raw findings.
- Authoritative outcomes emit from the server; client emits teaser view and CTA intent only.

## Data

- `localisation_audits` — one row per domain key/slug, attempt/progress metadata, workflow run id, focus locales, teaser JSON, full report JSON, scores, timestamps
- `localisation_audit_leads` — email + delivery/verification state, token hash/expiry, sent/error timestamps

## Lead gen UX

Landing discloses methodology, crawl limits, privacy/safe-crawl posture, and that teasers are public. Result waiting state shows a progress stepper, expected duration, safe-to-leave messaging, and optional “Email me when ready.” Failure states expose retry. Contextual CTAs vary by score band (create workspace / deeper registered audit / book review).

Public teaser pages are the primary lead magnet:

- Score + top findings are indexable; remaining findings, linguistic notes, and page samples stay behind verified email unlock.
- Unlock copy states how many findings remain locked.
- Result pages show competitive standing (rank, percentile, public average) against other succeeded teasers and link back to the landing leaderboard.
- Share CTA copies the public teaser URL for viral comparison loops.

## Leaderboard

Landing includes a public leaderboard of succeeded teaser scores (domain + score only; never emails or full reports). Ranking is current scoring methodology first, then highest score, then most recently completed. Result pages compute standing against public teasers scored under the same methodology.

## Scoring methodology

`LOCALISATION_AUDIT_METHODOLOGY_VERSION` in `credits/catalog.ts` is stored on every teaser and report. Teasers without it were scored under methodology 1.

Methodology 2 (Lighthouse-style):

- Each check has a catalog `weight`. Dimension scores and the overall score are weighted means of scored checks.
- Page-level checks score the share of sampled pages that pass, so results do not depend on how many pages were sampled.
- Checks with nothing to measure are N/A and excluded, never treated as 100 or 0.
- Only measured (heuristic) checks are scored. LLM checks are shown as "AI-assessed, not scored" because model judgements vary between runs.
- Text overflow, layout breakage and responsive checks use layout measured in the sandbox browser at 1440px and 390px. A page only fails when its source-language sibling is cleaner.
- The overall score is multiplied by a locale coverage factor based on locales found by the crawl. Requested focus locales do not count.

The deeper audit for verified domains is in `2026-10-22-domain-deep-localisation-audit-design.md`.
