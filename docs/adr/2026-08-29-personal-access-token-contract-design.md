# Personal access token contract

## Date

2026-08-29

## Status

Accepted. This document fixes the product boundary for HL-665. It changes no
behaviour on its own. Follow-on issues implement it.

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
| List tokens in an organization | Active membership and `api_keys:read` |
| Create a token | Active membership and `api_keys:write` |
| Revoke any token in the organization | Active membership and `api_keys:write` |

`api_keys:read` and `api_keys:write` belong to `admin` and
`localization_manager`. This document does not change that mapping.

**Using a token** runs on the `x-api-key` header against `/api/v1/*`. A request
succeeds only when every one of these holds, in this order:

1. The hash of the presented secret matches a row.
2. `revoked_at` is null.
3. The organization's `lifecycle_status` is `active`.
4. The owner has an authoritative WorkOS membership in that organization,
   resolved live on this request.
5. The route's required scope is present in the token's `permissions` array,
   **and** the owner's role holds the capability that scope maps to.

Steps 1 and 2 answer `401`. Steps 3, 4, and 5 answer `403`. The second half of
step 5 does not exist yet; see below.

**Effective access is the intersection of the owner's current access and the
token's scopes.** Scopes subtract; they never add.

Token scopes are the four public values: `jobs:read`, `jobs:write`,
`files:read`, `files:write`. They gate `/api/v1/*` routes only. They are not
organization capabilities and must never be treated as such.

The owner's access is resolved live on every request, never snapshotted at
creation, and it has two halves. Only one of them is enforced today.

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

That contradicts the principle above, so the contract requires
`requireApiKeyPermission` to check the owner's capability as well as the token's
scope. Both must pass. The mapping mirrors the capability the equivalent
session-authenticated action already requires:

| Token scope | Owner must also hold | Effect |
| --- | --- | --- |
| `jobs:read` | `jobs:read` | None. Every role holds it. |
| `jobs:write` | `jobs:write` | `member`-owned tokens stop writing jobs. |
| `files:read` | `projects:read` | None today. Makes the rule total. |
| `files:write` | `jobs:create` | `member`-owned tokens stop uploading sources. |

Only `member` loses anything, and only where it never had the underlying
capability. `files:*` have no organization capability of their own, so they map
to the capability governing the equivalent product action: reading project
content, and starting work on it.

A failed capability check answers `403`, matching the existing scope failure.
The two are indistinguishable to the caller on purpose; a token holder learns
that access was denied, not how the owner's role is configured.

Three non-escalation properties follow, and follow-on work must preserve all
three:

- **A token cannot manage tokens.** The management routes mount under the
  org-scoped app router behind `workosAuthMiddleware`, not under `/api/v1`. No
  token can create or revoke a token, including its own. Holding
  `api_keys:write` is a property of a human session, never of a credential.
  This holds today and was verified.
- **A token cannot outrank its owner.** Requesting a scope is not the same as
  being granted the underlying capability. This does **not** hold today. The
  mapping above is what makes it hold.
- **`api_keys:write` is a creation gate, not a carried privilege.** The token
  never carries it.

One consequence is deliberate and should surprise nobody who reads this. A user
demoted to `translator` or `reviewer` keeps working tokens, because those roles
still hold every capability in the mapping above, but loses the ability to
revoke them. An admin or localization manager must revoke on their behalf, and
removing the member revokes automatically. Self-service revocation without
`api_keys:write` is excluded from V1; see [Out of scope](#out-of-scope).

### Cross-user visibility and revocation

Visibility stays organization-wide. Everyone with `api_keys:read` sees every
token in the organization, including tokens they do not own.

Restricting the list to its owner was considered and rejected. The capability
already belongs only to the two roles accountable for workspace security, and
hiding live credentials from them would trade a real oversight capability for a
privacy gain that the role mapping already provides.

The defect is not the breadth of the list. It is that the list is anonymous. So:

- **Owner attribution is mandatory.** Every token representation returned by the
  API carries its owner. A token rendered without an owner is a bug.
- Any holder of `api_keys:write` may revoke any token in the organization,
  including tokens they do not own. This matches today's behaviour and stays.
- Revoking someone else's token is a deliberate act and must read as one. The UI
  names the owner in the confirmation and states that the owner is not notified
  in V1.
- The owner is never a stranger to their own token. Owners with `api_keys:read`
  always see their own tokens listed.

### Lifecycle

`revoked_at` is the only stored state. `revoked_at IS NULL` means active.

Revocation is soft and terminal. The row is retained so that `jobs.api_key_id`
and `repository_source_file_versions.uploaded_by_api_key_id` keep resolving.
There is no un-revoke, by design: a leaked secret stays dead, and restoring
access means creating a new token.

A token is revoked when a holder of `api_keys:write` revokes it, or when the
owner's organization membership is removed. Membership removal is handled by
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

Paths, methods, and status codes are unchanged. One field is added.

`GET /api/orgs/:organizationSlug/api-keys` — requires `api_keys:read`. Returns
every token in the organization, revoked ones included, ordered by `createdAt`.
Each entry gains `owner`:

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

`POST /api/orgs/:organizationSlug/api-keys` — requires `api_keys:write`. Body is
`{ name, permissions? }`. `permissions` defaults to all four scopes. The
response is `201` and carries the plaintext `key` once, plus the same `owner`
object, which always describes the caller.

`DELETE /api/orgs/:organizationSlug/api-keys/:apiKeyId` — requires
`api_keys:write`. Scoped to the caller's organization. Answers `204`, or `404`
`api_key_not_found` for an unknown id or a token in another organization.

Revoking an already-revoked token must stay `204` and must leave `revoked_at`
untouched. This is a change: the handler currently re-stamps `revoked_at` on
every call, so a second revoke silently rewrites the moment access was withdrawn
and destroys the only timestamp an incident review has.

Owner email appears in this authenticated response because the settings surface
already shows member emails. It must not reach logs.
`x-api-key` is already redacted by `src/lib/log.ts`, and that redaction stays.

### UI contract

The settings page keeps its route and gains the ownership model.

- Rename the page and its copy to "Personal access tokens".
- Split the list into the signed-in user's tokens and other members' tokens.
  Attribute every row to its owner.
- Say plainly that a token acts with its owner's access and that it stops
  working when the owner leaves the organization. This is the single most
  surprising property of the credential and it is currently undocumented in
  product.
- Name the owner in the revoke confirmation when revoking someone else's token.
- Surface revoked tokens instead of filtering them out of the list, so that an
  automation failure can be diagnosed. Today the client drops every row with a
  `revokedAt`, which hides exactly the evidence an operator needs.
- The scope picker stays out of V1. The UI keeps creating tokens with all four
  default scopes, and the API keeps accepting a narrowed `permissions` array for
  callers that want it.

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

One live token can break, and only one kind. Enforcing the scope-to-capability
mapping stops a token whose owner's role no longer holds the underlying
capability, which in practice means a token owned by someone demoted all the way
to `member`. That is the defect being fixed, so the break is intended, but it is
still a break for whoever is running that automation. Before shipping the
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
- **Editing scopes after creation.**
- **Self-service revocation by an owner lacking `api_keys:write`.**
- **Notifying an owner when someone else revokes their token.**
- **A scope picker in the create UI.**
- **Retrieving a secret after creation.**

## Consequences

The credential users already hold becomes the credential the product describes.
No secret is reissued, the `x-api-key` header and `hl_` format are untouched, and
the CLI needs no change. What changes is that ownership becomes visible and
enforced: an admin can tell whose access a live token carries, and a demotion
now narrows the token instead of only narrowing its project list.

That last part is the one behavioural break, and it is deliberate. A token owned
by someone demoted to `member` stops writing jobs and uploading sources. Leaving
it working would mean shipping a contract whose central claim — scopes never
expand the owner's access — is false in the product.

The cost is accepting two rough edges rather than papering over them. A user
demoted below `api_keys:write` cannot revoke their own token. A Canva connection
bound to a departing member's token breaks and must be rebound by hand. Both
follow from choosing personal ownership without service credentials, both are
written down here rather than discovered later, and both are the clearest
argument for building organization-owned service credentials after V1.

Follow-on issues implement this contract in this order. Each is independently
shippable:

1. **Ownership in the API.** Add `owner` to the list and create responses.
   Backfill `revoked_at` on rows with a null `created_by_user_id`. Add route
   tests for owner attribution and for cross-user revocation staying allowed.
2. **Authorization hardening.** Teach `requireApiKeyPermission` to check the
   owner's capability alongside the token's scope, using the mapping above. Stop
   re-stamping `revoked_at` on an already-revoked token. Pin the three
   non-escalation properties with tests, including a regression test for the
   `member`-owned `jobs:write` case, which passes today and must fail after this
   lands.
3. **Settings UI.** Rename to personal access tokens, split own versus others,
   attribute every row, show revoked tokens, and name the owner in the revoke
   confirmation.
4. **Audit events and logging.** Emit `pat.created` and `pat.revoked` with the
   fields above. Add the owner user id to the request log context.
5. **Canva connection warning.** Flag a connection whose bound token is revoked
   or whose owner has left.
