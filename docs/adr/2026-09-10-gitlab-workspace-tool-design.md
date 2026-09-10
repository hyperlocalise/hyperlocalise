# GitLab Workspace Tool Design

## Date

2026-09-10

## Context

GitLab.com chat clone ships through WorkOS Pipes. The 2026-09-10 Pipes ADR left out a `use_gitlab_repository` workspace tool. Teams that keep source on GitLab.com need the same read-only repository agent GitHub already has.

WorkOS Pipes OAuth covers GitLab.com only. Automations run without the connecting user present, so GitLab.com automations stamp the author’s Pipes user the same way Ahrefs does.

## Decision

Keep GitLab.com on Pipes. Add `use_gitlab_repository` as a read-only workspace orchestrator tool, the GitLab counterpart of `use_github_repository`. Automations store `repositoryTarget.kind: "gitlab"` with `gitlabPathWithNamespace`. Runs use the stamped Pipes `workosUserId`.

Chat listing, picker keys, and pasted URLs stay on GitLab.com (`gitlab:<path>`).

Do not add self-hosted GitLab connections, GitLab webhooks, merge-request comment tools, or sync workflows.

## Consequences

- Scheduled GitLab.com automations fail if the stamped user disconnects GitLab.
- GitHub and GitLab remain exclusive repository targets on one automation.
