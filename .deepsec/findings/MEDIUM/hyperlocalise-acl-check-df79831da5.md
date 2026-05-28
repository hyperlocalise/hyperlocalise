# [MEDIUM] Dashboard summary endpoint exposes provider credential metadata without the provider credential read permission

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/dashboard/_components/tms-dashboard-summary-section.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/dashboard/_components/tms-dashboard-summary-section.tsx#L99-L104) (lines 99, 104)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

This component fetches `/api/orgs/:organizationSlug/tms-dashboard-summary` and trusts the returned `OrganizationTmsDashboardSummary`. Tracing that route shows it only applies `workosAuthMiddleware`, then returns `getOrganizationTmsDashboardSummary()`, which includes `providers` from `listOrganizationExternalTmsProviderCredentialDetails()`. That list item contains settings-level provider credential metadata such as `baseUrl`, `validationMessage`, `maskedSecretSuffix`, capabilities, and webhook subscription summaries. The dedicated provider credential list route requires `provider_credentials:read`, but this dashboard route does not, so any authenticated member of the organization can retrieve metadata that should be admin/provider-credential-reader scoped by inspecting the API response.

## Recommendation

Return a dashboard-specific provider DTO containing only the fields this UI uses, or enforce `provider_credentials:read` before returning credential details. Avoid including `maskedSecretSuffix`, validation details, base URLs, and webhook subscription data in the general dashboard summary response.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
