# Domain deep localisation audit

## Status

Proposed.

## Context

The public localisation audit (see `2026-07-25-localisation-audit-agent-design.md`) is a lead magnet. It samples up to 15 pages, scores 36 checks across four dimensions, and publishes the result on a public, indexable page and leaderboard. Methodology 2 made the score Lighthouse-like:

- Each check has a weight in `credits/catalog.ts`.
- Page-level checks score the share of sampled pages that pass.
- Checks with nothing to measure are N/A and excluded.
- LLM ("luna") results are shown as "AI-assessed, not scored".
- Reports store `methodologyVersion` and `localeCoverageFactor`. The leaderboard ranks the current methodology first, and standings only compare reports under the same version.

The sample is too small for a customer who wants to fix their site. Fifteen pages cannot show whether a German checkout is untranslated, whether hreflang clusters are reciprocal across the whole site, or whether a layout breaks on one template. Customers who link and verify a domain in the Domain feature (`linked_domains`, go-svc `linked-domain.go`) already prove ownership. That is enough to justify a heavier, private audit.

## Decision

Add a **deep audit** run type for verified linked domains. It is private to the organization, never public, and never on the leaderboard. It reuses the public audit's check catalog, scoring, and sandbox browser, so a deep audit and a public audit report the same score definitions. The deep audit just has more evidence per check.

### What "deeper" means

| Area | Public audit | Deep audit |
| --- | --- | --- |
| Page sample | Up to 15, homepage-seeded | Sitemap-driven, up to 500 URLs (plan-limited), grouped into source/target clusters |
| Pairing | By path after the locale prefix | hreflang clusters first, then path pairing, then sitemap `xhtml:link` alternates |
| Rendering | Desktop 1440px, plus 390px layout measurement | 1440, 768 and 390px; a full-page screenshot per viewport for failing pages |
| hreflang | Sampled pages only | Full cluster graph: reciprocity, self-reference, orphaned alternates, conflicting canonicals |
| Linguistic | AI-assessed, not scored | AI-assessed, plus scored glossary and TM checks when the org has them |
| Brand | None | Brand voice from the Domain "Brand" page used as review context |
| Prioritisation | None | Search Console clicks and impressions weight findings by traffic |
| Cadence | One free run per day per domain | On demand and scheduled (weekly or monthly), with a diff against the last run |

Glossary compliance and TM leverage are only scored when the org has a glossary or TM linked to the domain's project. Otherwise they stay N/A, as they are today.

### Scoring

The overall and per-dimension formulas match methodology 2. The deep audit adds two things.

1. **Template grouping.** URLs are clustered by path pattern (for example `/blog/*` or `/pricing`). A page-share check reports both the page share and the template share. The headline score uses the page share weighted by Search Console clicks when available, and falls back to an unweighted page share. One broken blog template should not look like 400 independent failures.
2. **Confidence interval.** When a check inspects fewer than 20 pages, the report shows the sample size next to the score. This reflects the Lighthouse lesson that variance needs to be visible.

Deep and public scores are not mixed. The Domain overview shows the deep score as the primary number once one exists. The public teaser score stays on the public page and is labelled "public sample".

### Data model

New table `localisation_deep_audits` (Drizzle schema in `src/lib/database/schema`, migration generated with `vp run db:generate`):

| Column | Notes |
| --- | --- |
| `id` | uuid |
| `organization_id` | FK, required |
| `linked_domain_id` | FK, required; the domain must be `verified` when the run starts |
| `status` | `queued` / `crawling` / `scoring` / `succeeded` / `failed` / `cancelled` |
| `trigger` | `manual` / `scheduled` |
| `requested_by_user_id` | nullable for scheduled runs |
| `methodology_version` | integer, copied from `LOCALISATION_AUDIT_METHODOLOGY_VERSION` |
| `page_limit` | integer, from the org's plan |
| `score`, `dimension_scores` | same shapes as the public report |
| `summary` | jsonb: credits, criteria counts, locale coverage, template groups |
| `previous_run_id` | self FK, used for diffs |
| `workflow_run_id`, `started_at`, `completed_at`, `error_code` | operational |

Child tables keep the large data out of the summary row:

- `localisation_deep_audit_pages`: `run_id`, `url`, `final_url`, `status`, `locale`, `template_key`, `cluster_key`, `layout` (jsonb, same shape as `LocalisationAuditPageLayout`), `screenshot_keys` (blob keys, failing pages only).
- `localisation_deep_audit_findings`: `run_id`, `credit_id`, `severity`, `title`, `summary`, `url`, `template_key`, `evidence`, `advice`, `traffic_weight`, `fingerprint`. The fingerprint is a hash of `credit_id`, normalized url or template, and title, so diffs can say whether a finding is new, fixed, or unchanged.

Schedules live on `linked_domains`: `deep_audit_schedule` (`off` / `weekly` / `monthly`) and `deep_audit_next_run_at`.

Screenshots go to the existing blob store under `org/{organizationId}/deep-audits/{runId}/`. They are deleted with the run, and runs older than 12 months are pruned.

### API

go-svc owns linked domains, so the deep-audit control plane lives there next to `linkedDomainAPI`:

- `POST /linked-domains/{id}/deep-audits` starts a run. It requires `status = verified`, rejects a second run while one is in flight (409), and checks plan quota.
- `GET /linked-domains/{id}/deep-audits` lists runs (summary row only).
- `GET /linked-domains/{id}/deep-audits/{runId}` returns the summary plus paginated findings, filterable by `credit_id`, `severity`, `template_key`, `locale` and diff state.
- `GET /linked-domains/{id}/deep-audits/{runId}/pages` lists paginated pages with layout data and signed screenshot URLs.
- `DELETE /linked-domains/{id}/deep-audits/{runId}` cancels a queued or running run.
- `PATCH /linked-domains/{id}` takes `deepAuditSchedule`.

Access follows the existing linked-domain rule in `linkedDomainAPI.load`: org admins and localization managers, the creator of an unassigned domain, or members of the project's team. Every query is scoped by `organization_id`.

The web app starts the Vercel workflow, because the crawler, sandbox browser and scorers are TypeScript. go-svc inserts the `queued` row and calls an internal Hono route (`POST /api/internal/deep-audits/{runId}/start`, shared-secret auth like other internal routes), which starts the workflow and stores `workflow_run_id`. A scheduled-run cron in go-svc enqueues runs from `deep_audit_next_run_at` the same way.

### Workflow

A new durable workflow `deepLocalisationAuditWorkflow` with these steps:

1. **Load and lock.** Re-check that the domain is verified and the run is still queued. Mark it crawling.
2. **Discover.** Read robots.txt and sitemaps (including indexes and `xhtml:link` alternates) with the SSRF-guarded fetch. Merge in the Search Console top pages when connected. Cluster URLs by template and hreflang group. Choose up to `page_limit` URLs: every template, every locale, and traffic-weighted within each template.
3. **Render in batches.** Render 25 URLs per sandbox command, reusing one sandbox per run (time-boxed, then recreated). Measure layout at three viewports. Take screenshots only when a page has a layout problem. Persist pages after each batch so a crash resumes instead of restarting. Respect robots.txt, keep concurrency at 1 per host, and stop on repeated 403/429 or a challenge page (same rule as the public crawl).
4. **Score.** Run the same heuristic scorers over all pages, group page-share results by template, and add cluster-level hreflang checks. Glossary and TM checks use the org's linked resources.
5. **AI review.** Run luna on a bounded, traffic-weighted subset (for example 40 page pairs), in chunks. The results stay unscored.
6. **Diff and persist.** Fingerprint findings, compare with `previous_run_id`, write findings, then write the summary and mark the run succeeded.
7. **Notify.** Add an activity log entry and an inbox notification. Email only if the user opted in.

Failures write `error_code` and keep the pages already persisted, so the UI can show a partial crawl.

### UI

Add an **Audit** tab to `domains/[linkedDomainId]` next to Overview, Brand, Prompts, Ranks, Keywords and Search Console.

- **Header:** deep score ring with dimension rings (same components as the public report), methodology version, last run time, schedule control, and a "Run deep audit" button. Before the first deep run, the tab shows the public sample score with a prompt to run the deep audit.
- **Criteria list:** the same groups as the public report (to fix, to watch, passed, AI-assessed, not applicable). Each criterion shows page share, template share, and sample size.
- **Findings table:** filters for dimension, severity, locale, template and diff state (new, fixed, unchanged), with columns for traffic weight and affected pages. Rows open a drawer with evidence, advice, the affected URLs, and screenshots for layout findings.
- **Runs history:** score trend and per-run diff counts.

Messages go in `*.messages.ts` files with `"use client"`. Data fetching goes through SWR keyed on the run id. The tab polls while a run is in flight.

### Privacy and safety

- Deep audit data is never exposed on public routes, the leaderboard, OG images, or sitemaps.
- Logs carry ids and counts only, never page text, URLs with query strings, or user data.
- Screenshot blob URLs are signed and short-lived.
- The crawler identifies itself with `LOCALISATION_AUDIT_USER_AGENT` and the same SSRF guards apply to every navigation and subresource.

## Alternatives considered

- **Raise the public audit's page limit.** Rejected. It increases cost for anonymous traffic, and the public score must stay comparable across domains.
- **Run the deep audit from go-svc.** Rejected. The crawler, scorers and sandbox browser are TypeScript, and duplicating them would let the two scores drift.
- **Score the AI review in deep audits.** Rejected for now, for the same reason as methodology 2: model judgements vary between runs. Revisit once we can show run-to-run stability on a fixed corpus.

## Rollout

1. Schema, go-svc endpoints and internal start route behind a feature flag.
2. Workflow with the 15-page cap lifted to 100, manual runs only.
3. Audit tab, findings table and diffing.
4. Search Console weighting, schedules, glossary and TM scoring.
5. Raise page limits per plan once sandbox cost per run is measured.
