# GitHub Auto-review and `@hyperlocalise review`

## Problem

The GitHub App can install, receive webhooks, and run a generic read-only `@hyperlocalise <instructions>` workflow. It does not ship a first-class localisation review. `@hyperlocalise fix` is explicitly refused. Auto-review on pull requests only exists if someone copies the “Notify on push blockers” workspace template.

We need two built-in surfaces:

1. Auto-review that a workspace operator can turn on from Automations.
2. `@hyperlocalise review` on a pull request comment.

Both post one sticky pull request comment. Both use one additional prompt.

## Decision

Store Auto-review as first-party org settings, not as a user-created workspace automation.

- Automations shows a “From Hyperlocalise” section above custom automations.
- Operators pick connected GitHub repositories and an optional additional prompt.
- Pull request `opened`, `reopened`, `synchronize`, and `ready_for_review` events enqueue review when Auto-review is on and the repository is selected. Drafts stay skipped until they are ready.
- `@hyperlocalise review` enqueues the same review even when Auto-review is off. Extra text after `review` is ignored. The shared additional prompt still applies.
- Generic `@hyperlocalise <instructions>` and the refused `fix` command stay as they are.

This keeps built-in review out of the custom automation list, so operators cannot delete or fork it by accident. Mentions and webhooks share one runner.

## Data

`github_auto_review_settings` is one row per organization:

- `enabled`
- `additional_prompt` (empty means default translation-review instructions only)

`github_auto_review_repositories` is the selected GitHub installation repository set.

Missing settings mean Auto-review is off, the prompt is empty, and no repositories are selected.

## Runtime

A shared `github-pull-request-review` workflow:

1. Claims an idempotency key (`auto_review` + head SHA, or `review` + comment id).
2. Clones the pull request head.
3. Diffs merge base (or base tip) to head.
4. Runs the read-only localisation review agent with the translation-review skill and the additional prompt.
5. Upserts a sticky comment marked `<!-- hyperlocalise-automation:auto-review -->`.

The mention bot still requires write, maintain, or admin on the repository. Auto-review does not; the GitHub App is the actor.

## UI

On Automations:

- Title, short description, and a toggle for Auto-review.
- Repository checkboxes for enabled, non-archived GitHub repositories.
- Additional prompt textarea.
- Copy that `@hyperlocalise review` runs the same review on demand.

If GitHub is not connected, the section still renders and explains that repositories appear after install.

## Out of scope

- `@hyperlocalise fix`
- GitHub Checks and inline annotations
- Per-repository prompts
- Replacing custom workspace automations
