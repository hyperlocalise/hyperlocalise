# OTA distribution contract

## Date

2026-09-04

## Status

Accepted. This document fixes the product boundary for HL-705. It changes no
behaviour on its own. Follow-on issues implement it.

## Context

Crowdin splits over-the-air delivery into Bundles, CDN Distributions, a public
hash, and a manifest. Hyperlocalise already has an authenticated download at
`GET /api/v1/projects/:projectId/translations/download`. That route requires
`x-api-key`, runs on the app origin, and is built for CLI and automation.

`loadProjectTranslationsAsPrefilledEntries` is the serializer behind that
route. With `includeAllSourceKeys` it writes every source key. Without the
flag it still accepts any non-rejected row that has text, including `draft`
and `needs_review`, and it includes hidden keys. Reusing it on a public CDN
would ship live CAT copy and force mobile apps to carry an API key.

OTA is a published snapshot of approved native-project translations, addressed
by an unguessable hash, served from CloudFront in front of a private S3
bucket. It does not replace the download route.

## Decision

### Entity

V1 has one entity: a **distribution**.

A distribution belongs to exactly one native project and selects:

- one or more source files that already have `project_translation_keys`
- one or more project target locales from `projects.target_locales`
- exactly one output format

Crowdin's Bundle stays out. A second format is a second distribution. Split
bundles out later only if one distribution must emit several formats at once.

Creating a distribution on an external TMS project (`projects.source` other
than `native`) is refused.

### Formats

V1 formats, stored as a closed enum on the distribution:

| Format | MIME type | Typical client |
| --- | --- | --- |
| `json` | `application/json; charset=utf-8` | Web / `@hyperlocalise/ota` |
| `android-xml` | `application/xml; charset=utf-8` | Android SDK |
| `ios-strings` | `text/plain; charset=utf-8` | iOS SDK |

Serializers are a follow-on. This contract freezes only the names, MIME types,
and these layout rules:

- **JSON** is a flat object keyed by the stored translation key.
- **Android XML** is a `<resources>` document. The `name` attribute is the
  stored key with `.` and `/` replaced by `_`.
- **iOS strings** uses the stored key as the quoted left-hand side.

XLIFF, YAML, ARB, and `xcstrings` stay out of V1.

### Release

Nothing reaches the CDN until an explicit **Release**. Saving a CAT segment
does not publish. There is no live-on-save mode and no preview channel.

A release reads `project_translations` at release time and writes a new
snapshot. Later CAT edits stay off the CDN until the next release.

Include a key only when every one of these holds:

- `project_translations.status` is `approved`
- `project_translations.text` is non-empty after trim
- `project_translation_keys.isHidden` is false
- the key's file and locale are selected on the distribution

`draft`, `needs_review`, and `rejected` stay out. Hidden keys stay out even
when approved. Provenance does not matter.

Do not call `loadProjectTranslationsAsPrefilledEntries` for a release. That
function is the download/CLI serializer. OTA needs its own approved-only
query.

A missing approved translation is omitted. The client falls back to strings
bundled in the app. The download route may keep filling source text; OTA
does not.

An empty snapshot is still a valid release. The locale stays in `languages`
and its content file is written empty (`{}`, empty `<resources>`, or an empty
`.strings` file) so paths stay stable.

If the selected locale is the project's `source_locale`, export each
non-hidden key's `source_text`. Source copy is treated as approved.

Release status is `in_progress`, `success`, or `failed`, matching Crowdin's
release object. The API may finish a small snapshot in the request; the
status field still exists so a later worker can take over.

### Public addressing

The only public identifier is the distribution **hash**.

- 16 cryptographically random bytes, lowercase hex, 32 characters
- Example: `50fb350641274ba88296f97dc7e3e0c3`
- No organization slug, project id, or project name appears in the hash or
  in any public path

The hash is a capability URL. Knowing it is read access to the published
snapshot. It is stored in plaintext so the UI can show it. It is not an API
key and it is never sent to `/api/v1`.

Public URLs, frozen:

```
https://ota.hyperlocalise.com/{hash}/manifest.json
https://ota.hyperlocalise.com/{hash}/content/{locale}/{exportPath}
```

Clients fetch content by concatenating the origin, the hash, and the path
from `content[locale]`, then appending `?t={timestamp}` from the manifest.

`GET` and `HEAD` only. Unknown or revoked hashes return `404`. The response
must not say whether the hash ever existed.

### Export paths

Public content paths use a per-file **export path**, not the repository
source path. Source paths can contain workspace folder names.

Default export path is the source file's basename. Two selected files may
not share an export path; create and update reject the collision.

Manifest `files` lists each export path with a leading slash and no locale
prefix. Manifest `content` prefixes the same path with `/content/{locale}`.

```
files: ["/messages.json"]
content: { "fr-FR": ["/content/fr-FR/messages.json"] }
```

### Manifest schema

`GET /{hash}/manifest.json` returns this JSON object and no other top-level
keys in V1:

```json
{
  "schema_version": 1,
  "format": "json",
  "files": ["/messages.json"],
  "languages": ["fr-FR", "de-DE"],
  "language_mapping": {
    "en-US": { "locale": "en" }
  },
  "timestamp": 1756961280,
  "content": {
    "fr-FR": ["/content/fr-FR/messages.json"],
    "de-DE": ["/content/de-DE/messages.json"]
  }
}
```

| Field | Type | Rule |
| --- | --- | --- |
| `schema_version` | number | Always `1` in V1 |
| `format` | string | The distribution's one format |
| `files` | string[] | Export paths with a leading `/` |
| `languages` | string[] | Project locale codes, as stored |
| `language_mapping` | object | Device locale → project locale. Empty object when unused, never `[]` |
| `timestamp` | number | Unix seconds of the successful release |
| `content` | object | Project locale → content paths. Every `languages` entry has a key |

`language_mapping` values are `{ "locale": "<project locale>" }`. The mapped
locale must appear in `languages`. Clients resolve in this order: exact match
in `languages`, then `language_mapping`, then the language prefix before `-`
or `_`.

Crowdin's `mapping` and `custom_languages` are omitted. Treat absence as
empty.

### CDN

Objects live in a private AWS S3 bucket. Only CloudFront reads them, through
Origin Access Control. The bucket name is an infra detail, not a public
contract.

S3 keys:

```
{hash}/manifest.json
{hash}/content/{locale}/{exportPath}
```

The same path layout is what CloudFront serves. No org, project, or user
name appears in a key.

Do not put the public OTA path on Vercel Blob, Cloudflare R2, or the
Hyperlocalise app origin. Vercel Blob stays the authenticated file store.
`GET /api/v1/projects/:projectId/translations/download` stays the
authenticated download.

Cache, frozen:

| Object | `Cache-Control` | CloudFront TTL | Client floor |
| --- | --- | --- | --- |
| `manifest.json` | `public, max-age=3600` | 3600s | Poll no faster than 15 minutes |
| `content/*` | `public, max-age=3600` | 3600s | Fetch only after `timestamp` changes |

Crowdin caches up to one hour. We match that.

A successful release overwrites the hash prefix and invalidates
`/{hash}/*` on CloudFront so the new snapshot is visible before the hour
elapses. Clients still wait out their 15-minute poll floor.

### Rotate and revoke

**Rotate** mints a new 32-character hash, writes the current snapshot under
the new prefix, points the distribution at the new hash, deletes the old
prefix, and invalidates both CloudFront paths. The old hash returns `404`
immediately. Apps that still embed it fall back to bundled strings until
they ship the new hash.

**Revoke** deletes the current prefix, invalidates CloudFront, and clears
the public hash. The distribution row remains. It has no public URL until
the next rotate. Revoke of an already-revoked hash is idempotent.

V1 keeps one live hash. There is no grace window and no dual-hash serving.
A leaked hash is killed, not faded out.

Deleting a distribution revokes its hash and then deletes the row.

### Existing download API

`GET /api/v1/projects/:projectId/translations/download` does not change.
It stays authenticated, app-origin, and suitable for CLI pull. OTA does
not add a public sibling on `/api/v1` and does not accept `x-api-key` on
CloudFront.

### Management

Management is authenticated (session or personal access token) and never
shares a code path with the CDN. Capability split:

| Action | Capability |
| --- | --- |
| List distributions, read hash and manifest URL | `projects:read` |
| Create, edit, delete, release, rotate, revoke | `projects:write` |

Exact REST paths are a follow-on. They mount under the existing org-scoped
app router and, if automation needs them, under `/api/v1/projects/:projectId`.
They do not become the URL an app calls at runtime.

### Out of scope

Excluded from V1 and not to be reopened by follow-on issues:

- Real-time in-app CAT preview
- Screenshot upload and string tagging
- Flutter / React Native first-party SDKs
- External TMS projects
- Serving `draft` or `needs_review` copy
- A second public download API
- R2, Vercel Blob, or app-origin fetches on the public path
- SIEM-grade CDN billing dashboards
- Dual-hash grace after rotate
- Crowdin `mapping` files and `custom_languages`

## Consequences

Later tickets can implement storage, release, CloudFront, serializers, and
clients without choosing a second model. The load-bearing rules are: one
format per distribution, explicit release of approved non-hidden strings,
hash-addressed CloudFront in front of private S3, one-hour CDN TTL, and a
15-minute client poll floor.

Two couplings are easy to get wrong and must stay separate. The download
serializer includes drafts, hidden keys, and source fallbacks; the release
query must not. Vercel Blob stores authenticated project files; it must not
become the public OTA origin.

Follow-on work, in this order:

1. **Persistence and management API.** Distribution row, hash, file and
   locale selection, format, rotate, revoke. Native-project-only create.
2. **S3 and CloudFront.** Private bucket, OAC, `ota.hyperlocalise.com`,
   cache headers, prefix invalidation on release and revoke.
3. **Release snapshot.** Approved-only query, format writers, S3 write,
   manifest, CloudFront invalidation.
4. **Clients.** `@hyperlocalise/ota`, iOS SDK, Android SDK. Each embeds
   the hash, reads the manifest, respects the 15-minute floor, and falls
   back to bundled strings on miss or `404`.
