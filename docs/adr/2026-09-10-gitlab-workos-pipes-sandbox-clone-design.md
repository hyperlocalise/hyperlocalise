# GitLab WorkOS Pipes Sandbox Clone Design

## Date

2026-09-10

## Context

GitHub repository context for chat and Slack clones through a GitHub App installation token. GitLab is already a WorkOS Pipes OAuth provider. Teams that keep source on GitLab.com need the same sandbox clone path without GitHub-parity features such as webhooks or merge-request automations.

Pipes credentials belong to the connected user. `workos.pipes.getAccessToken` vends a short-lived OAuth token. Git clone over HTTPS uses username `oauth2` and that token as the password.

## Decision

Connect GitLab on Integrations with the existing Pipes widget (`slugs: ['gitlab']`), admin-only like other Pipes rows. Flip the catalog entry from coming-soon to available.

List cloneable membership projects with `GET /api/v4/projects?membership=true&min_access_level=20` and expose them as `GET /api/orgs/:slug/gitlab/projects`. Chat's repository picker merges GitHub and GitLab with composite keys (`github:owner/repo`, `gitlab:group/project`). Conversation create and reply accept `repositoryProvider` plus `repositoryFullName`.

Resolve GitLab from a selected project or from `gitlab.com` project and merge-request URLs in the message. Persist `repositoryGitLabContext` on the conversation session. Clone into the Vercel sandbox with `createGitlabRepositorySandbox`. Reuse the stored sandbox when the GitLab context key matches.

Do not persist GitLab installation tables. Do not add GitLab webhooks or MR review automations.

Self-hosted GitLab and the `use_gitlab_repository` workspace tool are specified in `docs/adr/2026-09-10-gitlab-workspace-tool-and-self-hosted-design.md`.

## Consequences

- Only the connected user can list and clone GitLab projects.
- GitLab sandbox turns stay read-only for repository write tools that still require GitHub App context.
- Nested GitLab paths (`group/subgroup/project`) are first-class; GitHub `owner/repo` stays two segments.
