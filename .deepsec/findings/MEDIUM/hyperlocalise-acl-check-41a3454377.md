# [MEDIUM] TMS dashboard exposes admin-only provider credential details to regular members

**File:** [`apps/hyperlocalise-web/src/api/routes/tms-dashboard-summary/tms-dashboard-summary.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/tms-dashboard-summary/tms-dashboard-summary.route.ts#L9-L16) (lines 9, 12, 16)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The route only applies WorkOS session auth, then returns getOrganizationTmsDashboardSummary() for any authenticated organization member. That helper includes providers from listOrganizationExternalTmsProviderCredentialDetails(), whose records include provider credential metadata such as baseUrl, validationMessage, maskedSecretSuffix, capabilities, and webhookSubscriptions. The dedicated external-tms-provider-credential route protects the same detail helper with provider_credentials:read, which members do not have, so this endpoint bypasses the intended RBAC boundary and leaks integration configuration and operational details to lower-privileged users.

## Recommendation

Either require provider_credentials:read before returning provider detail objects, or return a sanitized dashboard-specific provider summary that excludes credential metadata, webhook subscriptions, masked secret suffixes, base URLs, and raw validation/sync error details for users without that capability.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
