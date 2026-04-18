# WorkOS App Auth Session Threading Design

## Decision

Thread the already-loaded WorkOS session from `requireAppAuthContext()` into
`resolveApiAuthContextFromSession()` so the app auth path performs one WorkOS
lookup per request.

Keep profile display fields in `AppShell` sourced from the live WorkOS session,
not the locally mirrored database row.

## Why

- Removes the duplicate `withAuth()` call on the app-shell render path.
- Preserves fresh profile name and avatar data even if webhook sync is delayed.
- Keeps organization membership and local IDs sourced from the database-backed
  auth context.

## Scope

- Add an optional injected session parameter to the auth resolver.
- Return the live session user from `requireAppAuthContext()`.
- Update `AppShell` to use `sessionUser` for display data.
- Add focused tests for session threading and redirect behavior.
