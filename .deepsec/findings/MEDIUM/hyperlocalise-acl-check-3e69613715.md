# [MEDIUM] Automation editor exposes integration metadata to roles that cannot manage automations

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.tsx#L1179-L1227) (lines 1179, 1195, 1213, 1227)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

WorkspaceAutomationEditor eagerly loads GitHub installation details, GitHub repositories, Slack agent settings, and Slack channels when it renders. The automation API itself requires isWorkspaceOperatorRole, but the traced supporting routes for GitHub installation/repositories and Slack settings/channels only apply WorkOS session auth and do not enforce integrations:read or integrations:write. Because the new automation page renders this editor for any authenticated organization member through AppShell, a low-privileged member can open the page or call the same endpoints and learn private repository names/default branches/enabled flags plus Slack team and channel metadata, including private-channel names visible to the bot.

## Recommendation

Enforce the same server-side capability checks on the GitHub and Slack read routes, and gate the automation editor/page with an appropriate capability such as integrations:read or the existing workspace-operator requirement before loading integration metadata.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
