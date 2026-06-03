# WorkOS identity and organization membership

Hyperlocalise treats WorkOS as the authoritative source for organization membership and access. Local tables cache product metadata and stable UUIDs for foreign keys.

## Canonical mappings

| WorkOS                       | Local (`organizations`)                         | Notes                                        |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------- |
| `organization.id`            | `organizations.workos_organization_id`          | Unique upstream key                          |
| `organization.external_id`   | `organizations.id`                              | Set when Hyperlocalise creates the workspace |
| `organization_membership.id` | `organization_memberships.workos_membership_id` | Unique upstream key                          |
| `user.id`                    | `users.workos_user_id`                          | Unique upstream key                          |

## Access vs cached profile data

| Data                                                    | Source of truth                                       | Used for                                  |
| ------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| Organization membership (active)                        | WorkOS `organization_membership` with `status=active` | API/app authorization                     |
| Membership role                                         | WorkOS membership role slug (1:1)                     | Capability checks after reconcile/webhook |
| User email, name, avatar                                | WorkOS user profile (cached in `users`)               | Display and audit only                    |
| Pending invite rows (`workos_membership_id IS NULL`)    | Local workflow state                                  | Member list UI, not access                |
| Replacing sentinel (`workos_membership_id = replacing`) | Local workflow state                                  | In-flight invite replacement, not access  |

Role slugs and the product capability matrix:
[`src/api/auth/LOCALIZATION_ROLES.md`](../../api/auth/LOCALIZATION_ROLES.md).

Provision WorkOS environment roles and capability permissions (idempotent — creates
missing slugs and permission assignments only; never removes or replaces existing
WorkOS role configuration):

```bash
bun run workos:setup
```

Requires [Bun](https://bun.sh) on your `PATH` (the script loads `.env` via `--env-file`).
`pnpm run workos:setup` works the same way.

Requires a real `WORKOS_API_KEY` in `.env` (skips when unset, `test-workos-api-key`, or
contains `placeholder`).

`ApiAuthContext.membership.accessSource` distinguishes these states:

- `workos_authoritative` — grants organization access
- `pending_invite` — local row only, no access
- `replacing_invite` — local in-flight replacement, no access

## Reconciliation

`reconcileWorkosMembershipsForUser` lists active WorkOS memberships for a user, upserts local rows, and revokes local access when WorkOS no longer reports an active membership.

Before listing WorkOS memberships, reconcile attempts a one-time promotion of legacy `local_org_*` workspaces the user belongs to. `migrateLocalOrgWorkspaceToWorkos` creates a real WorkOS organization (idempotent on `externalId = organizations.id`), creates active memberships for signed-in users, updates local `workos_organization_id` / `workos_membership_id`, and sets `lifecycle_status` back to `active`. This prevents losing access after WorkOS became authoritative.

Legacy workspace promotion runs automatically during reconcile on sign-in. Users without an active WorkOS membership after reconcile are routed to `/auth/onboarding`. Do **not** run `db:deprecate-local-org-workspaces` on workspaces you intend to keep; deprecation hides them from session loading.

It runs:

1. During session bootstrap (`resolveApiAuthContextFromSession`) before loading active memberships
2. After admin member role updates and removals (`member.route`)
3. Via WorkOS webhooks for incremental updates (with live membership verification on create events)

`users.workos_memberships_reconciled_at` records the last successful reconcile. If WorkOS lookup fails and the timestamp is older than five minutes, access is denied instead of trusting stale local membership rows.

## Placeholder users

Invited users who have not signed in use `users.workos_user_id` values prefixed with `invited_user_`. They may have pending local membership rows for member management UI, but they never receive `workos_authoritative` access until WorkOS confirms membership and the placeholder id is promoted on `user.created`.
