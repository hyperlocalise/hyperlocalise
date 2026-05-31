# WorkOS localization roles and product capabilities

Hyperlocalise mirrors WorkOS organization membership role slugs into
`organization_memberships.role` and derives product capabilities in
`policy.ts`. WorkOS remains authoritative; local rows are a cache updated by
reconcile, webhooks, and member mutations.

## Role slugs (WorkOS ↔ local)

| WorkOS / local slug    | Purpose                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `admin`                | Full workspace control including billing.                                                                                      |
| `localization_manager` | Operate projects, integrations, credentials, teams, and knowledge resources; approve reviews and write-back. No billing write. |
| `developer`            | Manage projects and technical jobs (sync, repos); read integrations. No review approval, credentials, members, or billing.     |
| `reviewer`             | Contribute to jobs, run AI actions, push draft translations; approve reviews and write-back. No org administration.            |
| `translator`           | Contribute to assigned jobs, run AI actions, push draft translations. No approvals or org administration.                      |
| `member`               | Read workspace, project, team, glossary, memory, and job surfaces only.                                                        |

Unknown WorkOS slugs map to `null` during reconcile and receive **no**
capabilities (default deny).

Legacy workspaces that only use WorkOS `admin` and `member` continue to work:
`member` stays read-only; `admin` retains full capability.

Run `bun run workos:setup` after pulling schema changes to create any missing
environment roles in your WorkOS project (see `src/lib/workos/IDENTITY.md`).

## Capability map (organization-wide)

Capabilities are checked after the WorkOS access gate via `policy.ts` and route
helpers in `capability-guards.ts`. This table is the org-wide ceiling; team
membership further limits which projects appear in listings.

| Capability                   | admin | localization_manager | developer | reviewer | translator | member |
| ---------------------------- | ----- | -------------------- | --------- | -------- | ---------- | ------ |
| `workspace:read`             | ✓     | ✓                    | ✓         | ✓        | ✓          | ✓      |
| `projects:read`              | ✓     | ✓                    | ✓         | ✓        | ✓          | ✓      |
| `teams:read`                 | ✓     | ✓                    | ✓         | ✓        | ✓          | ✓      |
| `glossaries:read`            | ✓     | ✓                    | ✓         | ✓        | ✓          | ✓      |
| `memories:read`              | ✓     | ✓                    | ✓         | ✓        | ✓          | ✓      |
| `jobs:read`                  | ✓     | ✓                    | ✓         | ✓        | ✓          | ✓      |
| `jobs:create`                | ✓     | ✓                    | ✓         | ✓        | ✓          |        |
| `jobs:write`                 | ✓     | ✓                    | ✓         | ✓        | ✓          |        |
| `ai_actions:run`             | ✓     | ✓                    | ✓         | ✓        | ✓          |        |
| `write_back:translation`     | ✓     | ✓                    | ✓         | ✓        | ✓          |        |
| `reviews:read`               | ✓     | ✓                    |           | ✓        |            |        |
| `reviews:approve`            | ✓     | ✓                    |           | ✓        |            |        |
| `write_back:approve`         | ✓     | ✓                    |           | ✓        |            |        |
| `agent_write:approve`        | ✓     | ✓                    |           | ✓        |            |        |
| `workspace:update`           | ✓     | ✓                    |           |          |            |        |
| `members:invite`             | ✓     | ✓                    |           |          |            |        |
| `teams:write`                | ✓     | ✓                    |           |          |            |        |
| `projects:create`            | ✓     | ✓                    | ✓         |          |            |        |
| `projects:write`             | ✓     | ✓                    | ✓         |          |            |        |
| `glossaries:write`           | ✓     | ✓                    |           |          |            |        |
| `memories:write`             | ✓     | ✓                    |           |          |            |        |
| `provider_credentials:read`  | ✓     | ✓                    |           |          |            |        |
| `provider_credentials:write` | ✓     | ✓                    |           |          |            |        |
| `api_keys:read`              | ✓     | ✓                    |           |          |            |        |
| `api_keys:write`             | ✓     | ✓                    |           |          |            |        |
| `integrations:read`          | ✓     | ✓                    | ✓         |          |            |        |
| `integrations:write`         | ✓     | ✓                    |           |          |            |        |
| `billing:read`               | ✓     | ✓                    |           |          |            |        |
| `billing:write`              | ✓     |                      |           |          |            |        |

Translators and members cannot manage credentials, members, billing, or
organization-wide settings. Developers can manage projects and technical jobs
and read integrations, but cannot approve reviews, write credentials, or invite
members. Reviewers can approve reviews and write-back but cannot manage
integrations or members. Localization managers share operational administration
with admins except billing write.

## Scope: organization vs project/team/locale

These roles are **organization-wide** in WorkOS and in `organization_memberships`.
They define the maximum access a user may have anywhere in the workspace.

Finer boundaries are layered separately:

- **Team membership** (`team_memberships.role`: `manager` | `member`) limits
  which projects and resources appear in listings.
- **Project / job / locale assignment** (future) further restricts translators
  and contractors to assigned work even when org capabilities would allow broader
  reads.

`bun run workos:setup` also syncs WorkOS environment permissions (additive) so
role slugs in the WorkOS dashboard mirror the capability slugs below.

Authorization helpers should treat org capabilities as necessary but not
sufficient where resource scope applies.

## Reconciliation from WorkOS

`reconcileWorkosMembershipsForUser` (`workos-membership-reconcile.ts`):

1. Lists active WorkOS memberships for the signed-in user.
2. Reads each membership `role.slug` (or string role).
3. Maps the slug with `workosRoleSlugToMembershipRole`; **skips** memberships
   whose slug is unknown (no authoritative local row is created or updated).
4. Upserts `organization_memberships` with `role`, `workos_membership_id`, and
   linked org/user rows via `syncWorkosIdentity`.
5. Revokes local rows whose `workos_membership_id` is no longer active in WorkOS.

Member invites and role changes call WorkOS first, then reconcile (see
`AUTH_INVARIANTS.md`). Pending rows without a WorkOS membership id never receive
capabilities.

## API helpers

- `getCapabilitiesForRole(role)` — capabilities for a cached membership role.
- `resolveCapabilitiesFromWorkosRoleSlug(slug)` — slug → role → capabilities.
- `hasCapability(role, capability)` — default deny for unknown roles.
- `isOrganizationAdminRole(role)` — `admin` only (last-admin invariant).
- `isWorkspaceOperatorRole(role)` — `integrations:write` (admin or localization_manager).
