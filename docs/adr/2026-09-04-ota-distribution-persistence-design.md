# OTA distribution persistence

## Date

2026-09-04

## Status

Accepted. This document freezes the storage contract for HL-706. It does not
add API routes, CDN upload, serving, or product UI.

## Context

OTA ships approved native-project translations to JS, iOS, and Android apps
over a public hash, the same pattern Crowdin uses for CDN Distributions. Later
tickets will create, update, release, and serve those records. They need one
place to write and a stable row shape.

## Decision

### Tables

| Table | Role |
| --- | --- |
| `ota_distributions` | Project-scoped selection: name, public hash, file ids, locales, format, audit, `revoked_at` |
| `ota_releases` | Immutable release: sequence, artifact pointer, manifest snapshot, `released_by`, `released_at` |

Deleting a project cascades both tables. Revoking a distribution sets
`revoked_at` and keeps the rows. Serving must treat a non-null `revoked_at` as
not found.

### Public hash

`public_hash` is 16 cryptographically random bytes encoded as 32 lowercase hex
characters. It is unique across every distribution. It is not derived from the
project id, name, or any other field. The value is a public address, not a
secret, so the row stores it in the clear.

A revoked hash stays reserved. Reissuing it would let an old client keep
resolving a distribution the operator meant to kill.

### Native projects only

The writer refuses `projects.source !== 'native'`. External TMS projects stay
out of OTA in v1.

File ids are `repository_source_files.id` values on that project. Locales must
canonicalize and must already belong to the project's source or target list.
Format is one of `json`, `android_xml`, or `ios_strings`.

### Writer

Later API tickets call `otaDistributionWriter` in
`apps/hyperlocalise-web/src/lib/ota/writer.ts`. That object is the only writer:

- `create` — assign a hash, store the selection
- `update` — change name, files, locales, or format on an unrevoked row
- `release` — lock the distribution, increment `sequence`, snapshot the
  manifest, store an optional artifact pointer
- `revoke` — stamp `revoked_at`; a second revoke is a no-op

`release` builds a Crowdin-shaped snapshot (`files`, `languages`, `content`,
`timestamp`) from the current selection. CDN upload may overwrite `content` or
`artifact_pointer` later. The writer does not upload bytes or serve files.

### Out of scope

CDN upload, product UI, public serving, and authenticated distribution routes
are later tickets. They must use this writer rather than inserting rows
themselves.
