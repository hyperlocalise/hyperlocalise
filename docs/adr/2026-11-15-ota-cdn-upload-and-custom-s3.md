# OTA CDN upload and custom S3 destinations

## Date

2026-11-15

## Status

Accepted. Follows [OTA distribution contract](./2026-09-04-ota-distribution-contract-design.md)
and [OTA distribution persistence](./2026-09-04-ota-distribution-persistence-design.md).

## Context

HL-705/706 froze the public contract and the `ota_distributions` /
`ota_releases` tables. The remaining gap was upload and serving: write
approved snapshots to object storage, expose management APIs and UI, and
let customers who refuse a Hyperlocalise-hosted origin use their own S3.

The public contract is hash-addressed files, an explicit Release, a
one-hour cache, and a JSON manifest.

## Decision

### Hosted path

There is **no** `ota.hyperlocalise.com` subdomain. Consumer URLs are:

- `https://public-api.hyperlocalise.com/ota/{hash}/...`
- `https://api.hyperlocalise.com/ota/{hash}/...` (go-svc)

Both read the latest successful `ota_releases.contents` for an unrevoked
hash. Optional `OTA_S3_BUCKET` / CloudFront can still store a copy, but
Postgres is the serve path. `GET /api/ota/{hash}/...` on the web app is
the local fallback. Optional `OTA_CLOUDFRONT_DISTRIBUTION_ID` invalidates
`/{hash}/*` after release, rotate, and revoke when S3 is configured.

### Custom path

`organization_cdn_destinations` stores an org-owned S3 (or S3-compatible)
location. AWS keys are encrypted with the provider-credential master key.
Create and update probe `HeadBucket` plus Put/Delete. A destination in use
cannot be deleted (`onDelete: restrict` on `ota_distributions.destination_id`).

Public URLs use the destination's `public_base_url`. Hyperlocalise does not
proxy customer buckets on the app origin.

### Release pipeline

1. Build an approved-only snapshot (`buildOtaReleaseSnapshot`). Do not reuse
   the CLI download serializer.
2. Write S3 objects under `{hash}/`.
3. Insert `ota_releases` with status `success` and the frozen manifest.
4. Invalidate CloudFront when hosted.

Rotate mints a new hash, copies the frozen prefix (do not rebuild from live
CAT copy), deletes the old prefix, and invalidates both. If the copy fails,
the previous hash is restored. Revoke deletes the current prefix and keeps
the hash reserved. Manifest URLs are omitted until a successful release.

### Capabilities

Management APIs use `projects:read` / `projects:write`. Native projects only.

## Consequences

- Hosted serving works without S3 or a dedicated OTA hostname.
- Custom destinations need the customer to put HTTPS in front of their bucket.
- Export paths are source-file basenames; colliding basenames are rejected.
- Distributions pin a native version `branch_name`. Hyperlab binds a variant
  to a distribution (`ota_experiment_bindings`); OFREP attaches `metadata.ota`
  and leaves the boolean flag value unchanged.
