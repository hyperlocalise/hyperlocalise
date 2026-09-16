# Workspace identity word policy

## Context

Workspace names and slugs currently accept profanity and placeholder terms such as `test`.
These values appear in shared URLs, navigation, and external identity systems, so creation and
later edits need the same policy.

## Decision

Add one server-side workspace identity policy and use it from onboarding and the workspace update
API schema. The policy rejects:

- English profanity detected as whole words or compound-word segments.
- The reserved tokens `test`, `testing`, `demo`, `example`, `sample`, and `placeholder`.

Matching is case-insensitive. Spaces, hyphens, and underscores form token boundaries. Substrings
remain valid, so `contest` does not match `test`.

Use `@2toad/profanity` for the maintained English profanity dictionary. Keep the product-specific
reserved tokens in the local policy module so changes remain explicit and reviewable.

## Validation flow

Onboarding validates the workspace name before provisioning either the local or WorkOS
organization. It returns a field error that asks the user to choose another name.

The workspace API validates submitted names and slugs before checking conflicts or changing either
system. Invalid API requests keep the existing `invalid_workspace_payload` error contract and
include the offending field in the validation details.

Existing records are not migrated. The policy applies when a user creates or updates a workspace.

## Testing

Focused tests cover reserved terms, profanity, case-insensitive and compound matching, and safe
substrings. Onboarding and workspace API tests verify that each mutation boundary enforces the
shared policy.
