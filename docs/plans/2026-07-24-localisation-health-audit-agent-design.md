# Localisation health audit agent

## Goal

Create a public lead-generation tool that audits a submitted website URL for
technical localisation readiness, linguistic quality, and market fit. The
initial audience is localisation managers at established global companies,
followed by product and engineering teams beginning international expansion.

The page will promise:

> How ready is your website for global customers? Get a free localisation
> health check covering technical setup, translation quality, and market fit.

The tool must demonstrate value before collecting contact details. It should
also turn useful audit data into shareable reports and aggregate SEO content
without exposing personal or sensitive information.

## User journey

1. A visitor submits one public URL.
2. The agent discovers explicit locale alternatives from `hreflang` and
   language switchers. Canonical links and URL patterns supply candidates that
   require an explicit signal or user confirmation.
3. The visitor confirms or corrects the detected language and target market.
4. The audit shows progress while it discovers locales, checks technical
   setup, reviews customer-facing language, and compares market experiences.
5. The free result shows the overall score, three category scores, three
   high-impact findings, and the number of locked findings.
6. The visitor enters a work email to unlock the full web report and receive an
   emailed copy.
7. The primary call to action invites the lead to book a localisation strategy
   call.
8. A secondary call to action lets product and engineering visitors create a
   Hyperlocalise workspace and save the audit.

The flow will not require an account, phone number, or company questionnaire
before showing the summary.

## Audit model

### Technical readiness: 40%

- Valid document language
- Complete and reciprocal `hreflang`
- Correct `x-default`, canonical, and locale URLs
- Discoverable locale switcher with valid destinations
- Mixed-language or untranslated content
- Localised metadata, structured data, images, and accessibility labels
- Encoding, layout overflow, and text expansion
- Locale-appropriate dates, numbers, currencies, and units

### Linguistic quality: 40%

- Fluency, grammar, and clarity
- Literal or machine-translated phrasing
- Terminology consistency
- Tone consistency
- Untranslated fragments
- Calls to action and navigation language
- Locale-specific usage, such as `en-US` compared with `en-GB`

### Market experience: 20%

- Currency, units, dates, addresses, and legal expectations
- Local relevance of claims, examples, social proof, and imagery
- Search intent alignment in headings and metadata
- Market-appropriate conversion language

Every finding will include its affected URL, severity, confidence, evidence,
business impact, and a suggested fix. The report must distinguish observed
facts from model judgements. It must not claim translation accuracy when it
cannot identify a reliable source page for comparison. Missing evidence does
not reduce a score.

Each score version will define the points available for every rule, the
severity thresholds, and the minimum confidence required to score a
model-assisted rule. Calculate a category score from earned points divided by
applicable points; exclude rules without enough evidence from both values.
Apply the 40/40/20 category weights only after calculating each category.
Publish the score version and evaluated-rule count with the report so a result
can be reproduced.

If a category has no applicable points or does not meet its score version's
minimum evidence threshold, show **Insufficient evidence** instead of a numeric
category score. Withhold the overall score unless all three categories meet
their minimum thresholds; do not reweight the remaining categories.

## Agent workflow

1. **Validate:** Normalise the URL, block private networks, enforce rate limits,
   and confirm public access.
2. **Discover:** Fetch the submitted page and identify explicit locale
   alternatives. Do not run an unrestricted crawl.
3. **Confirm:** Ask the visitor to confirm the detected language and target
   market.
4. **Extract:** Capture visible copy, metadata, links, locale controls,
   structured data, formatting, and screenshots.
5. **Compare:** Match equivalent sections across locale pages only when the
   match meets a confidence threshold.
6. **Evaluate:** Run deterministic technical checks first. Send only relevant
   extracted content to the linguistic evaluator.
7. **Synthesize:** Deduplicate findings, rank them by business impact,
   calculate versioned category scores, and generate the report.
8. **Convert:** Reveal the summary immediately. Store and email the full report
   after lead capture.

The workflow will use bounded concurrency and page and content limits. It will
return partial results when an alternative page is unavailable. It will state
blocked pages, unsupported claims, and low-confidence locale matches as report
limitations rather than findings.

## Persistence and public reports

Store every completed or partial audit as versioned records:

| Record | Purpose |
|---|---|
| `audit` | Submitted URL, status, target locale and market, timestamps, and score version |
| `audit_page` | Discovered URL, locale, extraction status, and content fingerprint |
| `audit_finding` | Category, severity, confidence, sanitised evidence, impact, and recommendation |
| `audit_report` | Public summary, private full-report reference, visibility, indexing state, and report version |
| `audit_lead` | Contact data and conversion state, separate from public report data |
| `audit_event` | Report viewed, unlocked, shared, booked, or converted to a workspace |

Content fingerprints may reuse a recent extraction. A changed fingerprint,
target market, or scoring version starts a new audit version rather than
overwriting prior evidence.

The public summary will use an opaque stable slug such as
`/localisation-audit/a1b2c3d4`. It will show the domain, audit date,
scores, three high-level findings, sanitised recommendations, and Hyperlocalise
calls to action. It will not expose email addresses, detailed
vulnerability-like findings, raw model output, raw extracted content, or
sensitive evidence.

The full report is a separate private projection. The unlock flow will bind it
to the visitor's browser session and send an expiring, signed access link by
email. The public slug must never resolve to the private projection, even after
the visitor unlocks it.

Public summaries will be shareable but `noindex` by default. A summary becomes
eligible for indexing only when:

1. The submitter explicitly opts into public indexing.
2. The report passes completeness and uniqueness thresholds.
3. Automated checks find no sensitive content.
4. The submitter verifies control of the domain, or Hyperlocalise independently
   reviews and approves the report as editorial content.

Domain ownership cannot be inferred from URL submission, and opt-in alone
cannot index a third-party domain. Domain owners must have a removal path.
Aggregate, anonymised findings can support indexable benchmark pages such as
localisation health benchmarks for SaaS websites. This creates stronger SEO
content than automatically indexing thin reports.

Raw extracted content and screenshots will be encrypted, restricted to the
audit service and authorised support staff, and deleted within 30 days. Private
reports and findings will be retained for 12 months unless the lead requests
earlier deletion. Retained findings may contain only short, sanitised evidence
excerpts; links to raw artifacts must expire when those artifacts are deleted.
Lead records follow the product's consent, suppression, and legal retention
policies. A deletion request must cover raw artifacts, private reports, public
summaries, and lead links while retaining only records required for suppression
or legal compliance.

## Lead generation

The unlock form will require a work email. Name, role, and primary target
market are optional. Company inference from an email domain is advisory because
free, agency, and shared domains make it unreliable.

Attach the following audit context to the lead:

- Domain and discovered locale count
- Overall and category scores
- Critical finding count
- Apparent localisation maturity
- Relevant technology signals
- Report views, shares, and revisits
- Strategy-call and workspace conversion events

Lead priority will combine product fit and intent. A multi-locale site with
recurring defects and repeat report visits is a stronger lead than a
single-language brochure site with a low score. Follow-up should cite specific
findings instead of sending generic nurture copy. Localisation leaders should
see the strategy-call path first; product and engineering visitors should also
see the workspace path. GitHub connection remains a post-workspace option
outside this audit's first version.

Collect product events through first-party analytics with an opaque `audit_id`;
do not send URLs, emails, extracted copy, or findings as event properties.
Carry a signed audit reference through strategy-call and workspace links so
server-side conversion events can connect to the audit. Apply regional consent
requirements and retain event-level analytics for no more than 13 months.

## System boundaries

The first version includes:

- Public URL submission
- Explicit locale-alternative discovery
- Language and target-market confirmation
- Deterministic technical checks
- Model-assisted linguistic and market review
- Overall and category scoring
- Three-finding preview and email-gated full report
- Persistent audit records
- Shareable, `noindex` summary pages
- Strategy-call and workspace calls to action
- Submission, unlock, sharing, and conversion analytics

The first version excludes:

- Full-domain crawling
- Scheduled monitoring
- GitHub or TMS root-cause diagnosis
- Custom glossaries and brand voice
- PDF generation
- Ahrefs or Semrush enrichment
- Automatically indexed domain reports
- Competitive comparisons

## Components

- Public audit form and progress interface
- URL discovery and extraction service
- Deterministic rules engine
- Linguistic evaluation agent
- Scoring and report generator
- Lead-capture service
- Public report renderer
- Background audit workflow

Expected integration failures should use typed result codes. URL fetching must
reuse the application's SSRF protections. Logs may contain opaque audit IDs,
statuses, timings, and counts, but not URLs, emails, page content, company
names, or model prompts.

## Failure handling

- Retry transient network and model failures within fixed limits.
- Return a partial report when one or more alternatives are inaccessible.
- Explain blocked, redirected, JavaScript-only, or authenticated pages.
- Never convert missing evidence into a negative finding or score.
- Rate-limit submissions by IP and domain.
- Cap locale alternatives, extracted content, screenshots, and model tokens.
- Treat page content as untrusted input and isolate it from agent instructions.
- Apply the documented retention and deletion policy to raw artifacts, reports,
  leads, and public summaries.

## Success measures

- Audit completion rate
- Summary-to-email conversion rate
- Report share and revisit rate
- Qualified strategy-call bookings
- Workspace creation rate
- Cost and latency per completed audit
- False-positive rate in human-reviewed samples

## Validation

- Unit-test every deterministic rule and scoring boundary.
- Integration-test redirects, malformed HTML, conflicting locale signals,
  JavaScript-only pages, and partial failures.
- Benchmark linguistic findings against human-reviewed multilingual samples.
- Test SSRF controls, prompt injection, abuse limits, and public-data
  redaction.
- Run end-to-end tests from URL submission through the three-finding preview,
  email unlock, private-link access, and shared public summary.
- Assert that failed email delivery preserves a retry path without exposing the
  full report.
- Assert that public summaries remain redacted and `noindex` until indexing
  consent, quality, ownership or editorial review, and sensitivity checks pass.
- Assert first-party analytics, both calls to action, signed conversion
  attribution, partial reports, retention, deletion, and domain-owner removal.
- Review early reports manually and measure false positives before publishing
  indexed benchmark content.

## Alternatives considered

### Conversational audit agent

An agent could ask about target markets, brand voice, and localisation
processes before auditing. This would collect richer qualification data but
would delay the first useful result and add friction to the lead funnel.

### Website localisation grader

An instant score would be simple and shareable, but a score without evidence
could resemble a generic SEO checker. The chosen design uses the score as the
hook and supports it with evidence-led findings.

### Single-page snapshot

Auditing only the submitted page would cost less, but it would miss the
cross-locale defects that matter most to localisation managers. The chosen
design audits the submitted page and its explicit locale alternatives without
introducing a general crawler.
