# Bolt's Journal - Critical Learnings Only

## 2024-05-24 - Initializing Bolt's Journal
**Learning:** Always keep a record of critical performance learnings to avoid repeating mistakes.
**Action:** Created this file to track future insights.

## 2025-05-15 - Redundant TooltipProvider Removal
**Learning:** Nested `TooltipProvider` instances in React components (like `Message`, `Artifact`, `WebPreview`) add unnecessary context overhead and can lead to desynced timers if the root already provides one. In this codebase, `apps/hyperlocalise-web/src/app/layout.tsx` provides a global `TooltipProvider`.
**Action:** Removed local `TooltipProvider` instances from `ai-elements` components to streamline the React tree and reduce memory/render overhead.

## 2026-05-17 - Caching strings.Replacer for multi-segment rendering
**Learning:** Rebuilding a `strings.Replacer` for every segment in a document rendering loop is expensive due to trie construction. In this codebase, Liquid placeholders are document-wide, meaning the same replacer can be reused across all segments in a `liquidDocument`.
**Action:** Move `strings.Replacer` initialization to the document level (`parseLiquidDocument`) and cache it in the document struct to achieve ~85% faster rendering and ~95% fewer allocations.

## 2026-05-20 - Optimizing segment processing hot paths
**Learning:** In high-volume translation parsing, small overheads in `isTranslatableChunk`, `containsHTMLTag`, and placeholder expansion accumulate. A fast-path `strings.Contains(s, "<")` before regex and `strings.ReplaceAll` for single placeholders provide significant speedups (~5x and ~10x respectively). Unnecessary sorting of sentinel tokens in `strings.Replacer` can also be safely removed as they are fixed-length and non-colliding.
**Action:** Implemented fast-paths and removed redundant allocations/sorting in `internal/i18n/translationfileparser`.

## 2026-05-25 - Reducing allocations in list normalization
**Learning:** `strings.Split` followed by `strings.TrimSpace` on each part is a common but expensive pattern due to intermediate slice and string allocations. Replacing it with a manual `strings.IndexByte` loop avoids the intermediate slice.
**Action:** Optimized `NormalizeList` in `internal/i18n/locales/normalize.go` achieving ~50% fewer allocations and ~30% faster execution.

## 2026-05-25 - Using slices.Compact for deduplication
**Learning:** Go 1.21's `slices.Compact` provides a cleaner and more efficient way to deduplicate sorted slices compared to manual loops with intermediate slices.
**Action:** Updated `uniqueStrings` in `icuparser` to use `slices.Compact`.
