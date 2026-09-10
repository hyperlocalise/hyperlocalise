# GitLab Workspace Tool and Self-Hosted GitLab Design

## Date

2026-09-10

## Context

GitLab.com chat clone ships through WorkOS Pipes. The 2026-09-10 Pipes ADR left out a `use_gitlab_repository` workspace tool and self-hosted GitLab. Teams that keep source on GitLab now need the same read-only repository agent GitHub already has, including instances that are not gitlab.com.

WorkOS Pipes OAuth only covers GitLab.com. Self-hosted GitLab needs an org-level instance URL and access token. Automations run without the connecting user present, so GitLab.com automations stamp the author’s Pipes user the same way Ahrefs does.

## Decision

Keep GitLab.com on Pipes. Add org-level `gitlab_connections` rows for self-hosted instances: HTTPS `baseUrl`, encrypted personal access token, and validation against `GET /api/v4/user`. Reject `gitlab.com` as a self-hosted base URL.

Parameterize the GitLab REST client and clone helper with an API origin. Clone still uses HTTPS username `oauth2` and the access token as the password.

Add `use_gitlab_repository` as a read-only workspace orchestrator tool, the GitLab counterpart of `use_github_repository`. Automations store `repositoryTarget.kind: "gitlab"` with `gitlabPathWithNamespace` and optional `gitlabConnectionId`. GitLab.com runs use the stamped Pipes user. Self-hosted runs use the connection token.

Chat listing, picker keys, and pasted URLs accept both GitLab.com and stored self-hosted origins. Self-hosted picker keys are `gitlab-connection:<connectionId>:<path>`. GitLab.com keys stay `gitlab:<path>`.

Do not add GitLab webhooks, merge-request comment tools, or sync workflows in this change.

## Consequences

- Scheduled GitLab.com automations fail if the stamped user disconnects GitLab.
- Self-hosted instances must be reachable over HTTPS from Hyperlocalise (public hostname, not loopback).
- GitHub and GitLab remain exclusive repository targets on one automation.
