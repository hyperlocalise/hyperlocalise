# Organization access invariants

These contracts protect enterprise identity. Regression coverage lives in
`identity-access-regression.test.ts`. Extend this list when adding roles, teams,
or collaboration features — do not weaken an invariant without an explicit
security review.

See also [`src/lib/workos/IDENTITY.md`](../../lib/workos/IDENTITY.md) for the
full WorkOS identity model.

## Access gate (session bootstrap)

1. **WorkOS is authoritative.** Session and API access require a local
   membership row with a real, non-`replacing` `workos_membership_id` that
   WorkOS still reports as active after reconcile.
2. **Local membership alone never grants access.** A row in
   `organization_memberships` without WorkOS confirmation (pending invite,
   replacing sentinel, or stale authoritative id) must not appear in
   `resolveApiAuthContextFromSession` results.
3. **Pending invites never grant access.** `workos_membership_id IS NULL` is
   member-list UI state only (`accessSource: pending_invite`).
4. **Replacing sentinel never grants access.** `workos_membership_id = replacing`
   blocks access while an invite replacement is in flight
   (`accessSource: replacing_invite`).
5. **Placeholder users never bootstrap access.** Users with
   `workos_user_id` prefixed `invited_user_` skip WorkOS membership reconcile
   and cannot receive `workos_authoritative` session context.
6. **Reconcile runs before membership load.** Every
   `resolveApiAuthContextFromSession` call reconciles (subject to TTL) before
   querying active memberships.
7. **Fail closed on stale WorkOS.** If membership lookup fails and
   `users.workos_memberships_reconciled_at` is older than five minutes, deny
   with `workos_membership_lookup_failed`.
8. **Removed WorkOS members lose access on reconcile.** Local authoritative
   memberships absent from WorkOS active membership listing are revoked during
   reconcile (and via webhooks).

## Route authorization

9. **Session cookie is the only API auth channel.** Forged
   `x-hyperlocalise-auth` headers or other client-supplied identity must not
   bypass `workosAuthMiddleware`.
10. **Org slug must match an active membership.** Requested
    `organizationSlug` must resolve to a membership returned after the access
    gate; otherwise return `organization_access_denied` or picker/unresolvable
    errors — never silently fall back to another org.
11. **Archived organizations are excluded.** Only organizations with
    `lifecycle_status = active` participate in session membership queries.

## Member management mutations

12. **Mutations sync to WorkOS before granting new access.** Invites, role
    changes, and removals call WorkOS first; local changes roll back when WorkOS
    rejects the operation.
13. **Admin mutations cannot create WorkOS-denied access.** Pending local rows
    and placeholder users remain non-authoritative until WorkOS confirms
    membership; admin PATCH/POST must not set a real `workos_membership_id`
    without a corresponding WorkOS membership.
14. **At least one admin required.** Admin demotion/removal is blocked when
    the locked admin count would drop below one.

## Capability layer (`policy.ts`)

16. **Capabilities derive from reconciled role only.** `hasCapability` runs
    after the access gate; roles on pending or revoked rows must never reach
    capability checks.
17. **Member role is read-only for admin capabilities.** Members receive
    baseline read capabilities only; `members:invite` and other admin writes
    require admin roles.
18. **Unknown WorkOS role slugs default deny.** Unrecognized slugs do not map to
    a membership role, are skipped during reconcile/webhook sync, and resolve to
    no capabilities. See [`LOCALIZATION_ROLES.md`](./LOCALIZATION_ROLES.md).

## Future extension points

When adding team-scoped roles or contractor access:

- Keep the access gate in `workos-session.ts` — team policy in `team-access.ts`
  runs only after WorkOS-authoritative membership is established.
- Never treat local-only membership as sufficient for org or team resource
  access.
- Add a regression test in `identity-access-regression.test.ts` for each new
  access path.
