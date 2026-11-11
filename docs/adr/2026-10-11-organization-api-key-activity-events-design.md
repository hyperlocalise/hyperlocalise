# Organization API key activity events

## Status

Accepted

## Context

Settings → API keys creates and revokes rows in `organization_api_keys`. The
workspace activity log already recorded those mutations as personal-access-token
events because the table originally backed PAT semantics. The contract reserved
`organization_api_key_created` and `organization_api_key_revoked` until writers
could use the product name.

Operators now see Settings → API keys, not personal access tokens. Create and
revoke should appear under that name in Settings → Activity logs.

## Decision

Promote the reserved events and switch writers to them.

| Event | When | Target |
| --- | --- | --- |
| `organization_api_key_created` | Settings create succeeds | `organization_api_key` |
| `organization_api_key_revoked` | Manual revoke or membership-removal revoke succeeds | `organization_api_key` |

Do not emit both PAT and API-key events for the same mutation. Historical PAT
rows stay implemented so old activity still renders and filters.

Payloads stay safe metadata: key id, display name, prefix, granted permissions,
and revoke reason (`manual` or `membership_removed`). Never store the raw secret,
hash, or authorization header.

Session create and revoke use `actorKind: user`. WorkOS membership removal uses
`actorKind: system` when the actor is the webhook. Display name prefers the key
name and falls back to the prefix. The target links to
`/org/:slug/settings/api-keys`.

go-svc publishes after a successful create or revoke commit. Membership cleanup
in go-svc and WorkOS sync enqueue one revoke event per newly revoked key.

## Consequences

Settings → Activity logs can filter API key create and revoke separately from
legacy personal-access-token rows. The Settings API keys page is unchanged.
The PAT audit log (`pat.created` / `pat.revoked`) stays the security audit
record.
