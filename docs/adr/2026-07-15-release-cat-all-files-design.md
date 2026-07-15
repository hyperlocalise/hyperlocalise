# Release CAT All Files

## Decision

Gate CAT **All Files** (`sourcePath=*`) behind the Flags SDK release flag `release-cat-all-files` (default off via `decide`). Enable with Flags Explorer overrides. When the flag is on, support All Files only for **native** projects and **Crowdin** live projects. Other TMS providers stay unavailable until a later release.

For Crowdin, replace the per-file probe loop with a single project-scoped `GET /projects/{id}/strings` call (optional CroQL for search, queue filters, and optional file-id OR filters).

## Behavior

| Flag | Project | All Files UI | API `sourcePath=*` |
|------|---------|--------------|--------------------|
| Off | Any | Hidden | `feature_unavailable` (403) |
| On | Native | Shown | Existing DB All Files path |
| On | Crowdin | Shown | One project-wide strings page (+ CroQL) |
| On | Phrase / Lokalise / Smartling / other | Hidden | `provider_cat_all_files_unsupported` (501) |

Deep links and job CAT that default to All Files follow the same rules: when the flag is off or the provider is unsupported, do not open All Files (pick a single file or require selection).

## Crowdin fetch

- List live files once to map `fileId` → `sourcePath` / provider metadata (and to resolve optional `sourcePaths` filters into file ids).
- Call `listSourceStringsPage` once with `offset` / `limit`, using CroQL when search or queue filters apply, or when scoping to a subset of file ids.
- Infer `hasMore` / lower-bound `totalCount` the same way as single-file Crowdin CAT (REST has no total count).
- Segment order follows Crowdin’s project string order, not path-sorted file walks.

## Surfaces

- Flag: `releaseCatAllFilesFlag` in `release-flags.ts` (`decide` → `false`; Flags Explorer overrides; not WorkOS)
- API: `loadProjectFileCatQueue` gates before native / provider All Files loaders
- UI: CAT file picker and `/strings` / job CAT defaults only expose All Files when the flag is on and the project is native or Crowdin
- Provider: `getTmsProviderLiveCatAllFiles` is Crowdin-only; other providers throw `provider_cat_all_files_unsupported`

## Verification

- Unit tests for CroQL project-scope builders and Crowdin All Files one-call path
- Route tests for flag off, Crowdin on, native on, other TMS rejected
- Run `vp test` and `vp check --fix` from `apps/hyperlocalise-web`
