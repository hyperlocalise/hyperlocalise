# [BUG] FormatJS and grouped pack modes silently allow --prefix-id collisions

**File:** [`apps/cli/cmd/pack.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/pack.go#L305-L384) (lines 305, 309, 373, 379, 384)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

When --prefix-id is enabled, buildPackCatalog strips each FormatJS key to packedID and writes catalog[packedID] without checking whether another source id already stripped to the same value. runPackGrouped has the same missing collision guard; it appends stripped IDs by translation and then compacts duplicates, which can hide one colliding ID or emit the same packed ID under multiple translations. The flat path has an explicit sourceByPackedID collision check, so this appears to be an unintended gap. In batch mode, pack overwrites locale files by default, so a catalog containing ids such as src.foo.button.label and src.bar.button.label can be packed into a file with one entry lost or corrupted.

## Recommendation

Apply the same sourceByPackedID collision detection used by buildPackFlat to buildPackCatalog and runPackGrouped before writing output. Return an error when two source IDs map to the same packed ID, and add tests covering FormatJS catalog and --group-by-value collision cases.

## Revalidation

**Verdict:** true-positive

The FormatJS catalog part of this finding has been fixed: `buildPackCatalog` now tracks `sourceByPackedID` and errors on duplicate stripped IDs unless `--ignore-duplicate-id` is set. The grouped path is only partially remediated. `runPackGrouped` tracks `sourceByPackedID`, but when a duplicate packed ID has the same translation value as the first one, it silently executes `continue` instead of returning a collision error. A concrete input containing `src.foo.button.label: "Save settings"` and `src.bar.button.label: "Save settings"` with `--prefix-id --group-by-value` would emit only one `label` entry, hiding one source ID without requiring `--ignore-duplicate-id`. The more severe case where the same packed ID appears under different translations is now rejected, and grouped mode is single-file only, so the remaining impact is lower than the original HIGH_BUG rating. The finding remains real for grouped same-value collisions, but it should be downgraded.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
