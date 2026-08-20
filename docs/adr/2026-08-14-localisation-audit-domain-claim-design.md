# Localisation audit domain claim (guest → user)

## Date

2026-08-14

## Context

The public localisation audit is a lead magnet. Visitors run an audit,
unlock the full report with a verified email cookie, and see soft CTAs to
`/auth/sign-in` or book a demo. There is no guest identity, no link from
`localisation_audit_leads` to `users`, and no way to prove ownership of the
audited hostname.

We want to convert those visitors into Hyperlocalise workspace users the way
Google Search Console links a site: sign in first, prove domain control with
multiple methods, then exclusively attach the domain (and its audit) to the
org and seed a workspace project for deeper work.

Related: [localisation audit agent design](./2026-07-25-localisation-audit-agent-design.md).

## Decision

Use an org-scoped **linked domain** property. Do not hang ownership on
`localisation_audits` alone, and do not use GSC OAuth in v1.

### Product rules

1. **Signup first**, then domain verification, then claim.
2. Verification methods: **DNS TXT** (recommended), **HTML file**, and
   **meta tag**.
3. **First successful verification wins** exclusively for that `domainKey`.
4. Success **attaches the existing audit** and **seeds a workspace project**.
5. Lead email need **not** match the signed-in user. Ownership is proof of
   domain control.

### Architecture

| Concept | Role |
|---------|------|
| `localisation_audits` | Public lead magnet until claim succeeds |
| `linked_domains` | Org domain property; verification state; exclusive owner of a `domainKey` |
| Workspace `projects` | Seeded on success so deeper product work hangs off the linked domain |

Happy path:

1. Audit result (or report email) CTA: “Claim this domain”.
2. Unauthenticated users go through WorkOS sign-in/sign-up with `returnTo` to
   the link-domain page for that `domainSlug` (preserve intent through
   onboarding when the user has no org yet).
3. Authenticated user starts a pending linked-domain claim and receives a
   verification token plus instructions for all three methods.
4. User picks a method and verifies. The server checks DNS or fetches HTML/meta
   with the same SSRF-safe hostname rules as the audit crawler.
5. Before verify, the user chooses **create a new project** or **use an existing
   workspace project**.
6. On success, one transaction: mark verified, enforce exclusive ownership,
   attach the audit to the org, link or create the project, redirect into the app.

Public teaser pages stay public and indexable after claim.

## Data model

### `linked_domains`

| Field | Purpose |
|-------|---------|
| `id` | UUID primary key |
| `organizationId` | Owning workspace |
| `createdByUserId` | User who started the claim |
| `domainKey` | Normalized hostname (same rules as audits) |
| `domainSlug` | Stable slug; joins to the audit |
| `sourceUrl` | Canonical URL for HTML/meta checks |
| `status` | `pending_verification` \| `verified` \| `failed` \| `revoked` |
| `verificationToken` | Opaque challenge token |
| `preferredMethod` | Last chosen method (`dns_txt` \| `html_file` \| `meta_tag`) |
| `verifiedMethod` | Method that succeeded (nullable until verified) |
| `verifiedAt` | Set on success |
| `localisationAuditId` | Audit being claimed (nullable for later non-audit use) |
| `projectId` | Seeded project id (set on success) |
| `createdAt` / `updatedAt` | Timestamps |

Constraints:

- Unique `(organizationId, domainKey)`.
- Partial unique on `domainKey` where `status = verified` (global exclusive
  ownership).
- Other orgs may hold pending claims until someone verifies. The verify
  transaction loses cleanly if another org already verified.

### Existing tables

- `localisation_audits`: add nullable `linkedDomainId` and/or `organizationId`,
  set only after successful claim.
- `projects`: no schema change; create a normal native project and store its id
  on `linked_domains`.

### Challenge material

- **DNS TXT**: record at `_hyperlocalise-verify.<domain>` (or apex) with value
  `hyperlocalise-site-verification=<token>`.
- **HTML file**: `https://<host>/.well-known/hyperlocalise-verification.txt`
  (body = token). Fallback path `/hyperlocalise-verification.html` may be
  documented if needed.
- **Meta tag**: on the homepage,
  `<meta name="hyperlocalise-site-verification" content="<token>" />`.

## APIs and UX

Org-scoped routes behind WorkOS auth:

| Endpoint | Behavior |
|----------|----------|
| `POST /api/orgs/:orgId/linked-domains` | Start claim from `domainSlug` / audit; create pending row + token |
| `GET /api/orgs/:orgId/linked-domains/:id` | Status + challenge instructions |
| `POST /api/orgs/:orgId/linked-domains/:id/verify` | Body `{ method, projectId? \| createProject? }`; check challenge; on success attach audit and link to an existing project or create one |
| `GET /api/orgs/:orgId/linked-domains` | List for settings |
| `DELETE` (optional in v1) | Cancel **pending** claim only |

Surfaces:

- Audit result CTA and optional report-email CTA.
- Authenticated **Link domain** page for `domainSlug`.
- Workspace settings list of pending and verified linked domains.
- After claim, owning session sees “Open in workspace”; other visitors still
  see claim CTAs but verify returns `domain_already_claimed`.

Analytics follow localisation-audit rules: low-cardinality, non-PII event props
only (no email, domain, or free text).

## Errors and security

Stable error codes: `auth_required`, `onboarding_required`, `audit_not_found`,
`audit_not_ready`, `domain_already_claimed`, `claim_pending_exists`,
`verification_not_found`, `verification_fetch_failed`, `verification_mismatch`.

Security:

- Reuse audit SSRF-safe URL/hostname validation for HTML/meta fetches.
- Fetch only `http(s)` to the claimed host; block off-host redirects (or
  enforce same registrable domain).
- Resolve DNS only for the claimed `domainKey` and the verify subdomain.
- High-entropy tokens; rate-limit verify attempts per org/domain.
- Enforce exclusive claim in the database (partial unique) and in the verify
  transaction.

## Testing

- Unit: challenge builders; DNS/HTML/meta parsers; exclusive verify race.
- Route: start claim, verify side effects, already-claimed, pending cancel.
- Inject resolver/fetcher fakes in CI; do not call real DNS.

## Out of scope (v1)

- Transfer or release of verified domains
- Auto-try-all methods in one request (user selects a method per attempt)
- Google Search Console OAuth as proof
- Blocking public audit re-runs until a domain is claimed
- Requiring unlock-lead email to match the signed-in user

## Consequences

- Clear GSC-like conversion path from public audit to paid/product workspace.
- New schema and authenticated UI beyond the marketing audit surface.
- Public SEO teasers remain shareable; product value moves behind verified
  domain ownership.
- Future “sites” features can reuse `linked_domains` without coupling to audits.
