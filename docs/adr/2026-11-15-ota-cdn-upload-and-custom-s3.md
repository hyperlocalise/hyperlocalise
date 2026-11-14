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

Hyperlocalise-hosted objects live in a private S3 bucket (`OTA_S3_BUCKET`).
CloudFront in front of that bucket is the public origin
`https://ota.hyperlocalise.com/{hash}/...`. Optional
`OTA_CLOUDFRONT_DISTRIBUTION_ID` invalidates `/{hash}/*` after release,
rotate, and revoke.

`GET /api/ota/{hash}/...` is a fallback for local and tests. Production
clients hit CloudFront, not the app origin.

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

- Hosted CDN needs `OTA_S3_BUCKET` (and usually CloudFront) in production.
- Custom destinations need the customer to put HTTPS in front of their bucket.
- Export paths are source-file basenames; colliding basenames are rejected.
