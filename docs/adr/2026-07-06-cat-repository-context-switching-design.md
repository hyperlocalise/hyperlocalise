# CAT Repository Context Switching

## Goal

Changing the selected GitHub repository must preserve the active CAT workspace. The switch should update only repository-derived context.

## Design

Keep the CAT queue, selected segment, drafts, comments, filters, and search state independent of the selected repository. Remove the repository name from React keys and from queue and segment-target query identities because those resources do not depend on the repository.

Pass a repository context scope into the CAT runtime. When the scope changes, clear stored agent context, invalidate prior context attempts, and load cached context for the selected segment through the new repository-bound lookup service. Guard asynchronous context lookups with a generation token so a response from the previous repository cannot overwrite current context.

## Verification

Add focused tests that prove:

- queue and segment-target query identities remain stable across repository changes;
- changing repositories preserves workspace state;
- old repository context disappears and the selected segment loads context from the new repository;
- a late response from the previous repository is ignored.

Run the focused CAT and page tests, then run `vp test` and `vp check --fix` from `apps/hyperlocalise-web`.
