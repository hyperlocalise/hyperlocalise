# [MEDIUM] Dashboard summary exposes admin-scoped provider details to all org members

**File:** [`apps/hyperlocalise-web/src/lib/providers/organization-tms-dashboard-summary.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/organization-tms-dashboard-summary.ts#L97-L229) (lines 97, 100, 221, 225, 229)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

getOrganizationTmsDashboardSummary loads full provider credential details for the organization and returns them in the providers array, including base URLs, masked secret suffixes, webhook subscription identifiers/endpoints, org-wide counts, and recent provider sync error messages. The mounted tms-dashboard-summary route only applies WorkOS session auth and does not require provider_credentials:read, which policy reserves for owner/admin roles. A regular organization member can therefore query this summary and learn integration configuration and org-wide TMS state outside the narrower project/team access controls used elsewhere.

## Recommendation

Require provider_credentials:read or another explicit integration-read capability before returning provider details. If members need a dashboard, return a reduced, team-filtered summary that omits credential, webhook, and provider error details.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
