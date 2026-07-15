# Release CAT All Files

## Decision

Gate CAT **All Files** (`sourcePath=*`) and the project **Strings** sidebar behind the Flags SDK release flag `release-cat-all-files`. `decide({ entities })` enables the feature only when `entities.providerKind` is native (`null`) or **Crowdin**. Callers pass the provider via `isReleaseCatAllFilesEnabled(providerKind)` / `.run({ identify })`. Other TMS providers stay unavailable until a later release. Flags Explorer overrides still win over `decide`.

For Crowdin, replace the per-file probe loop with a single project-scoped `GET /projects/{id}/strings` call (optional CroQL for search, queue filters, and optional file-id OR filters).

## Behavior

| Provider (`entities.providerKind`) | Strings sidebar | All Files UI | API `sourcePath=*` |
|------------------------------------|-----------------|--------------|--------------------|
| Native (`null`) | Shown | Shown | Existing DB All Files path |
| Crowdin | Shown | Shown | One project-wide strings page (+ CroQL) |
| Phrase / Lokalise / Smartling / other | Hidden | Hidden | `provider_cat_all_files_unsupported` (501) or `feature_unavailable` when overridden off |

Deep links and job CAT that default to All Files follow the same rules: when `decide` is false for the provider (or Flags Explorer forces off), do not open All Files (pick a single file or require selection).

## Crowdin fetch

- List live files once to map `fileId` → `sourcePath` / provider metadata (and to resolve optional `sourcePaths` filters into file ids).
- Call `listSourceStringsPage` once with `offset` / `limit`, using CroQL when search or queue filters apply, or when scoping to a subset of file ids.
- Infer `hasMore` / lower-bound `totalCount` the same way as single-file Crowdin CAT (REST has no total count).
- Segment order follows Crowdin’s project string order, not path-sorted file walks.

## Surfaces

- Flag: `releaseCatAllFilesFlag` in `release-flags.ts` (`decide` → `supportsCatAllFilesProvider(entities.providerKind)`; Flags Explorer overrides; not WorkOS)
- API: `loadProjectFileCatQueue` evaluates the flag with the resolved provider before native / provider All Files loaders
- UI: project Strings sidebar uses the same provider gate; `/strings` / job CAT / CAT file picker pass provider into `isReleaseCatAllFilesEnabled`
- Provider: `getTmsProviderLiveCatAllFiles` is Crowdin-only; other providers throw `provider_cat_all_files_unsupported`

## Verification

- Unit tests for CroQL project-scope builders and Crowdin All Files one-call path
- Route tests for flag off, Crowdin on, native on, other TMS rejected
- Run `vp test` and `vp check --fix` from `apps/hyperlocalise-web`
