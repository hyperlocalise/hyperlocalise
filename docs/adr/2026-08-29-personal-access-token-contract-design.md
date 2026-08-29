# Personal access token contract

## Date

2026-08-29

## Status

Accepted. This document fixes the product boundary for HL-665. It changes no
behaviour on its own. Follow-on issues implement it.

It supersedes one bullet in the issue and the project brief. Both said that
creating a token requires `api_keys:write`. It does not. Any active member may
create a token, and their role decides what that token can do. The reasoning is
in [Who may create a token](#who-may-create-a-token).

## Context

Hyperlocalise already ships an organization API key. A row in
`organization_api_keys` holds a SHA-256 hash of the secret, a display prefix, a
permission array, `created_by_user_id`, `last_used_at`, and `revoked_at`. The
secret is `hl_` plus 32 random bytes in base64url. Callers send it in the
`x-api-key` header. `apiKeyAuthMiddleware` hashes the header, looks up the row,
rejects revoked keys, rejects archived organizations, and then calls
`resolveApiKeyTeamAccessContext` to rebuild the creator's live WorkOS
membership, role capabilities, and team scope on every request.

That credential is already personal in everything but name:

- It cannot act without a named human. `resolveApiKeyTeamAccessContext` returns
  `null` when `created_by_user_id` is null, when the user row is gone, or when
  the creator has no authoritative WorkOS membership. The middleware then
  answers `403`.
- It inherits the creator's current team and project scope, not a snapshot taken
  at creation. A demotion narrows which projects it can reach on the next
  request.
- Removing the creator from the organization revokes it.
  `revokeOrganizationMembershipAccess` sets `revoked_at` on every unrevoked key
  where `created_by_user_id` matches the departing user.

V1 productizes that credential as a personal access token. It does not
introduce a second token system.

Three things are missing today. All three were confirmed by exercising the
running application, not by reading the source:

1. **Ownership is invisible.** Neither the create response nor the list response
   carries any owner field. An admin sees a live credential and cannot tell
   whose access it carries.
2. **Ownership constrains nothing in the management API.** A
   `localization_manager` who did not create a key revokes it with `HTTP 204`.
   Nothing compares the caller to `created_by_user_id`; `ownedApiKeyWhere`
   filters on key id and organization id only.
3. **A key can outrank its owner's role.** `requireApiKeyPermission` checks the
   scope against the key's own `permissions` array and never against the owner's
   capabilities. A key scoped `jobs:write` and owned by a user whose role is
   `member` created a job successfully, although `member` does not hold the
   `jobs:write` capability.

The first two are presentation and contract gaps rather than security holes:
`api_keys:read` and `api_keys:write` already belong to `admin` and
`localization_manager` alone. The third is a real authorization defect. It is
bounded, because team and project scope still applies and only the `member` role
is affected, but it means a demotion does not fully take effect. Fixing it is
part of this contract.

There is also a product problem, and it is the reason the credential is being
productized at all. Because `api_keys:write` belongs to `admin` and
`localization_manager` alone, the four roles who do the actual localization work
cannot obtain a credential. A developer cannot run the CLI. A translator cannot
script a download. Today they either borrow an admin's secret, which destroys
attribution and survives their own departure, or an admin creates a token that
carries the admin's access and hands it over, which is worse. A personal
credential that nobody but an administrator can hold is not personal.

## Decision

### Terminology and identifiers

"Personal access token", or token, is the product name. It replaces "API key" in
the settings UI and in user-facing copy.

Nothing renames underneath:

| Surface | Value | Why it is frozen |
| --- | --- | --- |
| Table | `organization_api_keys` | Referenced by `jobs`, `repository_source_file_versions`, and `canva_connections` |
| Request header | `x-api-key` | Sent by the Go CLI in `apps/cli/cmd/sync_hyperlocalise.go` and by every published integration |
| Secret format | `hl_` + 32 random bytes, base64url | Changing it invalidates nothing but splits the format for no gain |
| Capabilities | `api_keys:read`, `api_keys:write` | Already mapped to roles in `LOCALIZATION_ROLES.md` |
| Management route | `/api/orgs/:organizationSlug/api-keys` | Consumed by the settings page |

The secret prefix stays `hl_` specifically. `getApiKeyPrefix` returns
`key.slice(0, 8)`, so the displayed prefix is `hl_` plus five characters of the
secret. A longer literal prefix such as `hl_pat_` would leave one random
character and make the display useless for telling two tokens apart. Any future
issue that changes the literal prefix must first change `getApiKeyPrefix` to
take the literal prefix plus a fixed number of random characters.

Showing five base64url characters discloses about 30 bits of a 256-bit secret.
The remaining entropy is not brute-forceable. The display prefix is intentional
and is not a leak to be fixed.

### Ownership

A token belongs to exactly one user and exactly one organization. Both bindings
are set at creation and never change.

- `created_by_user_id` is the **owner**, not merely the person who clicked
  create. It is the identity the token acts as. Read it that way everywhere.
- The create endpoint accepts no owner parameter and never will. The owner is
  always the authenticated session user. Nobody can mint a token that acts as
  somebody else, including an admin.
- Tokens are not transferable. There is no reassignment endpoint. To move
  automation to a different person, that person creates their own token and the
  old one is revoked.
- A user may hold any number of tokens in an organization. A user who belongs to
  several organizations holds separate tokens in each, and a token never reaches
  across organizations.
- A token whose owner cannot be resolved is permanently unusable. That covers a
  null `created_by_user_id` and a deleted user row, since
  `users.id` is referenced with `onDelete: "set null"`. This already fails
  closed. The contract adds that such a token must be presented as revoked
  rather than as active.

### Authorization

Two independent gates exist. They never share a code path and they never
substitute for each other.

**Managing tokens** runs on the WorkOS session.

| Action | Requirement |
| --- | --- |
| Create a token for yourself | Active membership |
| List your own tokens | Active membership |
| Revoke your own token | Active membership |
| List other members' tokens | Active membership and `api_keys:read` |
| Revoke another member's token | Active membership and `api_keys:write` |

Acting on your own tokens needs nothing beyond being a member of the
organization. Acting on somebody else's is administration and keeps the existing
capabilities.

That is a change in what `api_keys:read` and `api_keys:write` mean. They stop
being "may use API keys at all" and become "may administer other members'
tokens". The role-to-capability mapping in `LOCALIZATION_ROLES.md` does not
change, but its description of these two rows does, and the follow-on that
implements this must update that file.

#### Scope-to-capability mapping

Everything below rests on one table. Each token scope names the organization
capability its owner must hold for that scope to mean anything. The mapping
mirrors the capability the equivalent session-authenticated action already
requires:

| Token scope | Owner must hold | Roles that qualify |
| --- | --- | --- |
| `jobs:read` | `jobs:read` | all |
| `jobs:write` | `jobs:write` | all except `member` |
| `files:read` | `projects:read` | all |
| `files:write` | `jobs:create` | all except `member` |

`files:read` and `files:write` have no organization capability of their own, so
they map to the capability governing the equivalent product action: reading
project content, and starting work on it.

This mapping is applied twice, and both applications matter. At creation it
decides what a member may be granted. At request time it decides what the token
may still do. Neither substitutes for the other: the first stops a low-privileged
user minting a powerful credential, the second stops any credential surviving its
owner's demotion.

#### Who may create a token

Any member may create a token. Creation is not gated on a capability.

Gating creation on `api_keys:write` was the original decision and is reversed
here. It fails on its own terms: it locks the credential away from the developers
and translators who need it, and their workaround is to share an administrator's
secret, which is strictly worse than issuing them their own. A gate that people
route around by escalating is not a control.

Removing the gate grants no new access, because a token cannot exceed its
owner's role. A translator creating a token gains nothing they could not already
do while signed in. What they gain is a way to do it from a script, attributed to
them, revocable on its own, and dead the moment they leave.

Two things make that safe, and both are load-bearing:

- Scopes are capped by the owner's role at creation, so a `member` cannot mint a
  write credential.
- Scopes are capped again by the owner's *current* role on every request, so a
  token cannot outlive the access that justified it.

A user whose role is unknown to the capability map holds no capabilities and can
therefore grant no scopes. Creation is refused outright rather than producing an
empty token.

#### Grantable scopes at creation

The scopes a token may be granted are exactly those its owner's role can back.
Applying the mapping to the real capability table produces the following,
computed from `getCapabilitiesForRole` rather than derived by hand:

| Role | Grantable scopes |
| --- | --- |
| `admin` | `jobs:read`, `jobs:write`, `files:read`, `files:write` |
| `localization_manager` | `jobs:read`, `jobs:write`, `files:read`, `files:write` |
| `developer` | `jobs:read`, `jobs:write`, `files:read`, `files:write` |
| `reviewer` | `jobs:read`, `jobs:write`, `files:read`, `files:write` |
| `translator` | `jobs:read`, `jobs:write`, `files:read`, `files:write` |
| `member` | `jobs:read`, `files:read` |
| unknown | none — creation refused |

Only `member` is restricted, and only to read. Every other role gets the full
set, so opening creation changes what four roles can hold without changing what
any of them can do.

The default when `permissions` is omitted is the owner's full grantable set, not
the fixed list of four scopes it is today. A `member` who omits `permissions`
gets a read-only token instead of a `403`.

Requesting a scope the role cannot back is refused, not silently narrowed. A
credential that quietly does less than you asked for fails at three in the
morning inside somebody's pipeline. The response is `403`
`api_key_permissions_not_grantable`, and `details` names the refused scopes so
the caller can see which ones and ask for the right role.

Granted scopes are frozen at creation. A `member` later promoted to `translator`
does not gain `jobs:write` on an existing read-only token; they create a new one.
This is deliberate: the stored scope set records what was asked for and
approved, and widening it silently on promotion would make it meaningless.
Narrowing runs the other way and is not frozen, because the runtime check below
re-applies the owner's live role on every request.

#### Using a token

Requests carry the secret in the `x-api-key` header against `/api/v1/*`. A
request succeeds only when every one of these holds, in this order:

1. The hash of the presented secret matches a row.
2. `revoked_at` is null.
3. The organization's `lifecycle_status` is `active`.
4. The owner has an authoritative WorkOS membership in that organization,
   resolved live on this request.
5. The route's required scope is present in the token's `permissions` array,
   **and** the owner's current role holds the capability that scope maps to.

Steps 1 and 2 answer `401`. Steps 3, 4, and 5 answer `403`. The second half of
step 5 does not exist yet.

**Effective access is the intersection of the owner's current access and the
token's scopes.** Scopes subtract; they never add. Token scopes gate `/api/v1/*`
routes only; they are not organization capabilities and must never be treated as
such.

The owner's access is resolved live on every request, never snapshotted at
creation, and it has two halves. Only one is enforced today.

**Project and team scope is enforced.** `resolveApiKeyTeamAccessContext`
rebuilds the owner's context per request, and `buildAccessibleProjectsWhere`
narrows projects to what the owner can reach. An admin holds `teams:write` and
therefore sees every project in the organization; a demotion to `translator`
drops that on the next request and limits the token to the owner's team
memberships. This half already works.

**Role capabilities are not enforced, and V1 must fix that.**
`requireApiKeyPermission` compares the requested scope against the token's own
`permissions` array and stops there. It never consults the owner's role. The
consequence was reproduced against the running application: a token scoped
`jobs:write`, owned by a user whose organization role is `member`, and placed on
the project's own team, created a job with `HTTP 201` — even though `member` does
not hold the `jobs:write` capability.

Applying the mapping here is what closes that. A `member`-owned token stops
writing jobs and uploading sources; nothing else changes, because every other
role holds all four capabilities. This check is also what makes open creation
safe, so it must ship before or with the creation change, never after.

A failed capability check answers `403`, matching the existing scope failure.
The two are indistinguishable to the caller on purpose: a token holder learns
that access was denied, not how the owner's role is configured.

Three non-escalation properties follow, and follow-on work must preserve all
three:

- **A token cannot manage tokens.** The management routes mount under the
  org-scoped app router behind `workosAuthMiddleware`, not under `/api/v1`. No
  token can create or revoke a token, including its own. This holds today and
  was verified, and it is what keeps open creation from becoming self-replicating:
  a leaked secret cannot mint more secrets.
- **A token cannot outrank its owner.** Requesting a scope is not the same as
  being granted the underlying capability. This does **not** hold today. The
  mapping above is what makes it hold.
- **A token never carries `api_keys:read` or `api_keys:write`.** Those describe
  what a human session may do to other people's tokens. No credential holds
  them.

### Cross-user visibility and revocation

Everyone sees their own tokens. Nobody else's list is visible without
`api_keys:read`.

That split is new. Today the settings page is gated entirely on `api_keys:read`,
so a `translator` cannot reach it at all. Once any member can create a token,
every member must be able to see and revoke what they created. A credential you
can mint but cannot find is worse than no credential.

Organization-wide visibility survives on top of it. A holder of `api_keys:read`
sees every token in the organization, not only their own. Narrowing the list to
its owner was considered and rejected: the two roles accountable for workspace
security would lose sight of live credentials at exactly the moment the product
starts issuing far more of them.

The remaining rules:

- **Owner attribution is mandatory.** Every token representation returned by the
  API carries its owner. A token rendered without an owner is a bug, and it
  matters far more now that six roles can appear in the list rather than two.
- An owner may always revoke their own token, needing nothing but an active
  membership. This closes a hole in the earlier draft, where a user demoted below
  `api_keys:write` could not kill a credential they had created.
- A holder of `api_keys:write` may revoke any token in the organization.
- Revoking someone else's token is a deliberate act and must read as one. The UI
  names the owner in the confirmation and states that the owner is not notified
  in V1.

### Lifecycle

`revoked_at` is the only stored state. `revoked_at IS NULL` means active.

Revocation is soft and terminal. The row is retained so that `jobs.api_key_id`
and `repository_source_file_versions.uploaded_by_api_key_id` keep resolving.
There is no un-revoke, by design: a leaked secret stays dead, and restoring
access means creating a new token.

A token is revoked when its owner revokes it, when a holder of `api_keys:write`
revokes it, or when the owner's organization membership is removed. Membership
removal is handled by
`revokeOrganizationMembershipAccess`, which reaches every unrevoked token owned
by the departing user in that organization and leaves other members' tokens
alone.

Four further conditions make a token unusable without writing `revoked_at`.
Storing them would be wrong, because each is a property of the world rather than
of the token, and each can reverse:

| Condition | Response | Reverses when |
| --- | --- | --- |
| Organization archived or deprecated | `403 workspace_archived` | The organization is restored to `active` |
| Owner's membership is a pending invite placeholder | `403 forbidden` | The invite is accepted and reconcile runs |
| WorkOS lookup fails and the last reconcile is stale | `403 forbidden` | WorkOS recovers |
| Owner row deleted | `403 forbidden` | Never |

The third row is a deliberate fail-closed choice that already exists. A WorkOS
outage inside the freshness window keeps tokens working; past it, tokens stop.

The secret is disclosed exactly once, in the `201` body of the create call.
Only the hash is stored, so there is no retrieval path and no support path. A
lost secret means revoke and re-create.

Scopes are immutable after creation. Narrowing or widening a live credential in
place is a silent change to something already deployed. Revoke and create
instead.

`last_used_at` is best-effort telemetry, not an audit record. It is written
asynchronously and its failure is swallowed, so a request never fails because
the write failed. It is set only after authentication fully succeeds, so a
rejected request never updates it. It may lag under load. The UI must therefore
present it as an activity hint and must never present it as proof that a token
was or was not used.

### API contract

Paths and methods are unchanged. One field is added, and the authorization on
each endpoint changes as described above.

`GET /api/orgs/:organizationSlug/api-keys` — requires an active membership.
Returns the caller's own tokens, revoked ones included, ordered by `createdAt`.
A caller who also holds `api_keys:read` receives every token in the
organization instead. The shape is identical either way, so the client does not
branch on the caller's role; it renders what it is given. Each entry gains
`owner`:

```jsonc
{
  "apiKeys": [
    {
      "id": "…",
      "name": "…",
      "keyPrefix": "hl_AbCd",
      "permissions": ["jobs:read", "jobs:write", "files:read", "files:write"],
      "lastUsedAt": "…",
      "revokedAt": null,
      "createdAt": "…",
      // null only for legacy rows with no resolvable owner. Such a token is
      // unusable and must render as revoked.
      "owner": { "userId": "…", "email": "…", "firstName": "…", "lastName": "…" }
    }
  ]
}
```

`POST /api/orgs/:organizationSlug/api-keys` — requires an active membership.
Body is `{ name, permissions? }`. Omitting `permissions` grants the caller's full
grantable set rather than a fixed list of four. The response is `201` and carries
the plaintext `key` once, plus the same `owner` object, which always describes
the caller.

Requesting a scope the caller's role cannot back answers `403`
`api_key_permissions_not_grantable`, with `details` naming the refused scopes. A
caller whose role is unknown to the capability map can grant nothing and receives
the same error.

`DELETE /api/orgs/:organizationSlug/api-keys/:apiKeyId` — requires an active
membership when the caller owns the token, and `api_keys:write` otherwise.
Scoped to the caller's organization.

The failure for a token the caller neither owns nor may administer is `404`
`api_key_not_found`, the same answer as an unknown id or a token in another
organization. A member must not be able to probe for the existence of other
people's tokens by watching `403` and `404` diverge.

Revoking an already-revoked token must stay `204` and must leave `revoked_at`
untouched. This is a change: the handler currently re-stamps `revoked_at` on
every call, so a second revoke silently rewrites the moment access was withdrawn
and destroys the only timestamp an incident review has.

Owner email appears in these authenticated responses because the settings
surface already shows member emails. It must not reach logs.
`x-api-key` is already redacted by `src/lib/log.ts`, and that redaction stays.

### UI contract

The settings page keeps its route and opens to everyone.

- **Every member reaches the page.** Today `page.tsx` calls
  `requireAppCapability("api_keys:read")` and the settings nav and app shell hide
  the link behind the same capability. All three drop to requiring an active
  membership. This is the change that actually delivers the feature; without it a
  translator can create a token through the API and never see it in product.
- Rename the page and its copy to "Personal access tokens".
- Show "Your tokens" to everyone. Show a second "All workspace tokens" section
  only to holders of `api_keys:read`, and attribute every row in it to its owner.
- Say plainly that a token acts with its owner's access and that it stops
  working when the owner leaves the organization. This is the most surprising
  property of the credential and it is currently undocumented in product.
- Tell a `member` why their token is read-only, and say which role would grant
  more. A disabled control with no explanation reads as a bug.
- Name the owner in the revoke confirmation when revoking someone else's token.
- Surface revoked tokens instead of filtering them out of the list, so that an
  automation failure can be diagnosed. Today the client drops every row with a
  `revokedAt`, which hides exactly the evidence an operator needs.
- The scope picker stays out of V1. Creation requests the caller's full grantable
  set, and the API keeps accepting a narrowed `permissions` array for callers
  that want one.

### Compatibility and migration of existing keys

**Every existing key is reinterpreted in place as a personal access token. No
migration runs and no secret is reissued.**

This works because the runtime already behaves this way. Every usable key today
resolves a non-null `created_by_user_id` to a live membership on every request.
Naming that column the owner describes what the code does; it does not change
it.

Three cases and their handling:

| Existing row | Treatment |
| --- | --- |
| `created_by_user_id` set, owner is a current member | A personal access token owned by that user. No action. |
| `created_by_user_id` set, owner has left | Already revoked by `revokeOrganizationMembershipAccess`. No action. |
| `created_by_user_id` null | Already unusable at runtime. Backfill `revoked_at` so the stored state matches, and render `owner` as null. |

The third case is a data-consistency fix, not a functional change. Those rows
already answer `403`; the backfill stops them from appearing active in the list.

Opening creation to every member touches no existing row. It only widens who may
add new ones.

One live token can break, and only one kind. Enforcing the scope-to-capability
mapping stops a token whose owner's role no longer holds the underlying
capability. Because creation has always required `api_keys:write`, every
existing token was created by an admin or a localization manager, so the only
way to reach that state is a demotion all the way down to `member`. The
population should be near zero, and the fix is the defect being closed, but it
is still a break for whoever is running that automation. Before shipping the
authorization change, count the affected rows by joining unrevoked tokens to
their owner's membership role, and notify those organizations. The remedy is a
role correction or a token owned by someone who holds the capability.

`created_by_user_id` stays nullable in the database. Tightening it to `NOT NULL`
would require deciding what to do when a user row is deleted, and the current
`onDelete: "set null"` already fails closed. Tokens must be rejected because the
owner is unresolvable, not because a column is non-null. A follow-on may revisit
this once user deletion has an explicit token policy; nothing in this contract
depends on it.

Client-visible compatibility is total. The `x-api-key` header, the `hl_` secret
format, the four scopes, the `/api/v1/*` routes, and the CLI's
`HYPERLOCALISE_API_KEY` variable are all unchanged. The added `owner` field is
additive and breaks no existing consumer.

### Canva connections

`canva_connections.api_key_id` references `organization_api_keys` with
`onDelete: "restrict"`. A Canva connection is organization-level automation, yet
it is bound to a credential this contract declares personal. When the bound
token's owner leaves the organization, the token is revoked and the connection
stops working.

That is today's behaviour, not a regression this contract introduces. Making
ownership explicit only makes the coupling visible.

V1 does not fix it, because the fix is an organization-owned service credential
and that is out of scope for the whole project. V1 states the position instead:

- A Canva connection must be bound to a token owned by an active member.
- The remedy when a binding breaks is to rebind. `updateCanvaConnection` already
  accepts an optional `apiKeyId`, so an operator points the connection at a token
  owned by someone still present.
- A follow-on should warn in the Canva connection UI when the bound token is
  revoked or its owner has left. Diagnosing this today requires reading the
  database.

This coupling is an argument for organization-owned service credentials after
V1. It is not an argument for weakening personal ownership now.

### Audit events and safe logging

Audit events are a separate V1 issue. This contract fixes their vocabulary so
that issue does not reopen ownership questions.

Two events, and only two:

- `pat.created` — actor, owner, organization, token id, granted scopes. Actor
  and owner are always the same user, because creation on behalf of others is
  impossible. Record both anyway, so the invariant is auditable rather than
  assumed.
- `pat.revoked` — actor, owner, organization, token id, and a reason of
  `manual` or `membership_removed`. Actor and owner differ whenever an admin
  revokes someone else's token, which is precisely the event worth auditing.

Token **use** produces no audit event. One event per API call is write
amplification against the busiest path in the product. `last_used_at` plus
request logs cover it.

Logging rules, extending the app's existing constraints:

- Never log the secret or `key_hash`. `x-api-key` redaction in
  `src/lib/log.ts` stays and must cover any new field that could carry a secret.
- Never log owner email. Log `created_by_user_id`.
- The middleware currently binds `apiKeyId` and `localOrganizationId` to the log
  context. Add the owner user id, so an operational log line answers "whose
  access did this request carry" without a database round trip.
- `keyPrefix` is safe to log. It is already shown in the UI.

### Out of scope

Excluded from V1 and not to be reopened by follow-on issues:

- **Organization-owned service credentials.** Every token has a human owner.
- **Token expiry.** No `expires_at`, no TTL.
- **Automatic rotation.** No rotate endpoint. Rotation is revoke plus create.
- **Project-scoped or team-scoped tokens.** Scope comes from the owner's team
  membership, not from the token.
- **Bearer-token authentication.** `x-api-key` remains the only accepted scheme.
- **Documentation rewrite.** Existing docs stay until a docs issue is filed.

Also excluded, and specific to this contract:

- **Token transfer or owner reassignment.**
- **Editing scopes after creation**, including widening a token when its owner
  is promoted.
- **Notifying an owner when someone else revokes their token.**
- **A scope picker in the create UI.**
- **Retrieving a secret after creation.**
- **A per-user token limit.** Open creation makes one worth considering, but
  guessing a number before any usage data exists would be arbitrary. Revisit it
  once the audit events from step 4 show real creation rates.

## Consequences

The credential users already hold becomes the credential the product describes,
and for the first time the people who need it can get one. A developer runs the
CLI under their own name. A translator scripts a download. Neither has to borrow
an admin's secret, which is the practice this replaces and the reason the
current gate was never really a control.

Nothing about that widens access. A token cannot exceed its owner's role at
creation or at request time, so issuing one grants exactly what the owner could
already do through the browser. What changes is the shape of the risk: instead
of a handful of powerful admin secrets shared by hand, there are more secrets,
each weaker and each attributable. That is the better trade, but it is a trade,
and it only holds if the two caps ship together. Opening creation without the
runtime capability check would let a `member` mint a write credential. The
ordering below is therefore not a preference.

Two rough edges remain, and one from the earlier draft is gone. A user demoted
below `api_keys:write` can now revoke their own token, because owners always can.
What is left: a token owned by someone demoted to `member` stops writing jobs and
uploading sources, which is the defect being fixed rather than a regression; and
a Canva connection bound to a departing member's token still breaks and must be
rebound by hand. The second follows from personal ownership without service
credentials and is the clearest argument for building those after V1.

Follow-on issues implement this contract in this order. Steps 1 and 2 may ship
together but step 3 must not precede step 2:

1. **Ownership in the API.** Add `owner` to the list and create responses.
   Backfill `revoked_at` on rows with a null `created_by_user_id`. Add route
   tests for owner attribution and for cross-user revocation staying allowed.
2. **Authorization hardening.** Teach `requireApiKeyPermission` to check the
   owner's capability alongside the token's scope, using the mapping. Stop
   re-stamping `revoked_at` on an already-revoked token. Pin the three
   non-escalation properties with tests, including a regression test for the
   `member`-owned `jobs:write` case, which passes today and must fail after this
   lands.
3. **Open creation.** Drop the `api_keys:write` gate on create, cap granted
   scopes to the owner's grantable set, default `permissions` to that set, and
   add `api_key_permissions_not_grantable`. Scope list and revoke to the caller's
   own tokens unless they hold the administration capability, returning `404`
   rather than `403` for tokens they may not see. Update the two `api_keys` rows
   in `LOCALIZATION_ROLES.md` to describe administration rather than use.
4. **Settings UI.** Open the page, nav entry, and app-shell link to every member.
   Rename to personal access tokens, show "Your tokens" to everyone and the
   workspace-wide section to administrators, attribute every row, explain why a
   `member` token is read-only, show revoked tokens, and name the owner in the
   revoke confirmation.
5. **Audit events and logging.** Emit `pat.created` and `pat.revoked` with the
   fields above. Add the owner user id to the request log context.
6. **Canva connection warning.** Flag a connection whose bound token is revoked
   or whose owner has left.
