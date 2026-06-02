# [HIGH] Provider-controlled project URL is rendered without URL sanitization

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/projects/[projectId]/settings/page.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/projects/[projectId]/settings/page.tsx#L20) (lines 20)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The settings page renders ProjectSettingsPageContent, whose source connection section uses project.externalProjectUrl directly as an anchor href. That value is returned raw by the project API from schema.projects and is populated by external TMS sync. In particular, the Crowdin project fetcher copies project.webUrl from the provider response into externalProjectUrl, and upsertOrganizationExternalTmsProject stores it without sanitizeExternalUrl. A malicious or compromised provider endpoint, especially via a workspace operator-configured custom provider base URL, could persist a javascript: or otherwise unsafe URL and cause script execution when another user clicks Open in provider. Other resource serializers in this codebase use sanitizeExternalUrl, but project externalProjectUrl does not.

## Recommendation

Apply sanitizeExternalUrl to externalProjectUrl before storing it, before returning project records, or at minimum before rendering href attributes. Add a regression test using a javascript: externalProjectUrl and verify the UI/API returns null or omits the link.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
