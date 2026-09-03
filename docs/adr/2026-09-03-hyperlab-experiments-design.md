# Hyperlab experiments and feature flags

## Date

2026-09-03

## Context

Hyperlocalise will offer Hyperlab as a workspace product: customers create
flags and experiments, then evaluate them from their own apps. The system is
domain-agnostic. Translation is one possible use, not a required one. Schema,
APIs, and UI must not assume locale, project, TMS, or CAT data.

WorkOS feature flags stay the way we gate Hyperlocalise itself. Hyperlab is
the customer-facing flag and experiment product. The two do not share tables
or evaluate paths.

Evaluate traffic belongs in `go-svc`. Schema, migrations, admin CRUD, and the
management UI belong in `hyperlocalise-web`.

## Decision

Ship a multi-tenant Hyperlab in three layers:

1. **Postgres** — org-scoped `experiment_*` tables, migrated by the web app.
2. **go-svc** — OpenFeature Remote Evaluation Protocol (OFREP) only.
3. **Web** — org-scoped CRUD APIs and a full management UI.

Customers authenticate evaluate calls with a publishable client key
(`hlk_...`). That value is an opaque OFREP credential: official providers
send it as `Authorization: Bearer` or `X-API-Key`. The `hlk_` prefix is
for display and lookup, not a protocol requirement. Secret org API keys
stay for jobs and files.

Customers evaluate flags with the OpenFeature SDK and a community OFREP
provider. They set the provider `baseUrl` to the go-svc origin and pass
the publishable key. We do not ship a custom provider in v1.

### Product rules

- Every row is owned by an organization. Flag keys are unique per org.
- Flags are `experiment` or `config`. Experiments are `toggle` or `ab`.
- Evaluate is OFREP.
- Audience targeting uses a criterion tree of `attribute` leaves evaluated
  against the OFREP context.
- `targetingKey` is required for OFREP and is the bucket id. It is not a
  criterion field unless the caller also sends it as an attribute.
- IDs are UUIDs. Rollout uses a 0–10000 scale and 10000 buckets.

### Architecture

```
Customer app                    Workspace admin
     |                                |
     | publishable key                | WorkOS session
     v                                v
 go-svc                          hyperlocalise-web
  /ofrep/v1/evaluate/...          CRUD + Hyperlab UI
     |                                |
     +-------- shared Postgres -------+
              experiment_* tables
```

`go-svc` gains `DATABASE_URL` and reads the same database as the web app. It
validates the publishable key, scopes every query to that org, evaluates, and
caches results in process (about 60s TTL, bounded to 4096 entries). Admin
writes do not bust the cache in v1.

The public evaluate URL is the existing go-svc rewrite:
`/api/go-svc/ofrep/v1/evaluate/...`. Local and binding calls use the unprefixed
`/ofrep/v1/evaluate/...` path.

## Data model

Tables live in `apps/hyperlocalise-web/src/lib/database/schema/` and are
generated with `vp run db:generate`. Prefix them `experiment_` so they stay
apart from WorkOS product flags.

| Table | Role |
|-------|------|
| `experiment_flags` | `key` unique per org; `kind` is `experiment` or `config` |
| `experiment_flag_configs` | JSON value for `config` flags (1:1) |
| `experiment_audiences` | `name`, `description`, `criterion` JSONB |
| `experiments` | Named rollout: status, type, optional audience, percentage, seed, window, timezone |
| `experiment_variants` | Belong to an experiment; optional audience; percentage; `is_control` |
| `experiment_allocations` | Bucket range 0–9999 per variant |
| `experiment_flag_assignments` | Flag ↔ variant; `enabled`; JSON payload |
| `experiment_client_keys` | Hashed publishable key, display prefix, name, `revoked_at` |

Experiment status is `draft`, `active`, or `archived`. Types are `toggle` and
`ab`. Cascade deletes from the organization.

### Criterion

Logical nodes: `and`, `or`, `not`. One leaf type:

```json
{ "type": "attribute", "name": "plan", "match": "exact", "value": "pro" }
```

Matches: `exact`, `gt`, `gte`, `lt`, `lte`, `is_null`, `is_not_null`, `in`,
`contains_substring`, `contains_any`, `contains_substring_any`. `exact` keeps
JSON types: boolean `true` does not match the string `"true"`. Attribute
names are caller-defined. `locale` is a normal attribute if the caller sends
it.

### Evaluate

For each requested flag, go-svc loads active experiments in window, hashes
`experimentId + targetingKey + seed` into a bucket (murmurhash3, 10000
buckets), picks the first allocation that contains the bucket, then
evaluates the variant or experiment audience criterion against the OFREP
context. A `config` flag skips experiments and returns its JSON.

## Evaluate API (OFREP 0.3)

Auth: `Authorization: Bearer hlk_...` or `X-API-Key: hlk_...`. Both match
OFREP 0.3 (`BearerAuth` and `ApiKeyAuth`). A JWT is not required.

Flag keys are URL-safe (`[a-z0-9._-]+`) so they can sit in
`/ofrep/v1/evaluate/flags/{key}` without encoding surprises.

Server SDK (dynamic context, one flag per call):

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { OFREPProvider } from "@openfeature/ofrep-provider";

OpenFeature.setProvider(
  new OFREPProvider({
    baseUrl: "https://app.hyperlocalise.com/api/go-svc",
    headers: [["X-API-Key", "hlk_..."]],
  }),
);
```

Browser SDKs use the same base URL and key against
`POST /ofrep/v1/evaluate/flags` (bulk, static context).

| Method | Path | Use |
|--------|------|-----|
| `POST` | `/ofrep/v1/evaluate/flags/{key}` | Single flag (server SDKs) |
| `POST` | `/ofrep/v1/evaluate/flags` | All org flags (browser SDKs) |

```json
{ "context": { "targetingKey": "user-123", "plan": "pro" } }
```

Success:

```json
{
  "key": "checkout-cta",
  "value": true,
  "reason": "SPLIT",
  "variant": "treatment"
}
```

`value` is boolean, string, number, or object. Reasons we emit: `STATIC`
(config or default off), `TARGETING_MATCH`, `SPLIT`, `DISABLED` (assignment
off).

| Status | When |
|--------|------|
| `401` | Missing or invalid key |
| `400` | Missing `targetingKey` (`TARGETING_KEY_MISSING`) or bad context |
| `404` | Unknown flag on the single path (`FLAG_NOT_FOUND`) |
| `304` | Bulk `If-None-Match` matches |
| `500` | Unexpected failure (`GENERAL`); no internals in the body |

Bulk returns `{ flags: [...] }`. Each item is a success or
`{ key, errorCode }`. A `config` flag returns its JSON as `value` with
`reason: STATIC`. A config flag with no value is an evaluation error
(`GENERAL`), not a success without `value`. Request-level 500 bodies include
`errorCode: GENERAL`.

## Admin API

Org-scoped Hono routes, WorkOS session, resource-keyed envelopes. Create,
update, and revoke require admin, localization_manager, or developer. Any
member may read.

- Flags CRUD, plus config get/put
- Experiments CRUD, archive, activate
- Variants CRUD; allocations recomputed when rollout changes
- Audiences CRUD (criterion JSON)
- Flag assignments (flag ↔ variant)
- Client keys: create (secret once), list, revoke

Unknown org rows return `404`. Invalid criterion or rollout returns `400`.

## UI

WorkOS flag `workspace-hyperlab` gates the product, same pattern as
Automations. Off shows the existing teaser. On shows the pages. Sidebar item
**Hyperlab** under Workspace. The Integrations Hyperlab row links here
instead of Coming soon.

| Path | Screen |
|------|--------|
| `/org/[slug]/hyperlab` | Overview, OFREP base URL, key snippet |
| `/org/[slug]/hyperlab/flags` | List and create |
| `/org/[slug]/hyperlab/flags/[id]` | Edit, config JSON, assignments |
| `/org/[slug]/hyperlab/experiments` | List and create |
| `/org/[slug]/hyperlab/experiments/[id]` | Variants, allocations, audience, activate / archive |
| `/org/[slug]/hyperlab/audiences` | List and create |
| `/org/[slug]/hyperlab/audiences/[id]` | Attribute criterion builder |
| `/org/[slug]/hyperlab/keys` | Create, copy once, revoke |

Lists follow other workspace pages: header, primary action, table, empty
state, detail form. No analytics in v1.

## Testing

- Web: schema and CRUD (org isolation, key hashing, unique keys per org).
- go-svc: allocations, murmurhash, criterion eval, OFREP single and bulk,
  `401` / `400` / `404`.
- UI: list, empty, and create for flags, experiments, audiences, and keys.
- `make fmt`, `make lint`, `make test` for Go; `vp test` and `vp check --fix`
  for web.

## Out of v1

Exposure analytics, Redis, and OFREP SSE.
