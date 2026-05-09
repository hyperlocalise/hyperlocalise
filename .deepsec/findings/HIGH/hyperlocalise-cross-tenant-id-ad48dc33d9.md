# [HIGH] Chat request projectId is trusted before later worker code loads project context and credentials by projectId only

**File:** [`apps/hyperlocalise-web/src/api/app.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/app.ts#L56-L58) (lines 56, 58)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The app mounts chat request and conversation routes under the authenticated org path. The mounted chat request handler stores body.projectId/parsed.data.projectId directly on interactions and stored files without checking that the project belongs to c.var.auth.activeOrganization.localOrganizationId. The chat stream later passes conversation.projectId into buildTools, and createTranslationJobTool enqueues jobs with that projectId. The durable string translation executor then loads project context, attached glossary/TM data, and the OpenAI provider credential by projectId only. If a user can supply another organization's project id, they can create an attacker-owned conversation/job that uses or persists victim project context and provider-backed execution.

## Recommendation

Validate projectId against the active organization before storing it in chat interactions or files. Also harden worker-side loaders and job claim/update queries to require both projectId and the job or caller organizationId so a bad reference cannot cross tenant boundaries.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-07)
