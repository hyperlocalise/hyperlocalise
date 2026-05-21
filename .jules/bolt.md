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

## 2026-05-27 - Eliminating O(N log N) allocations in sort comparators
**Learning:** Using `strings.Join` or `fmt.Sprintf` inside a sort comparator (e.g., `sort.Slice`) creates allocations for every comparison, leading to (N \log N)$ total allocations. Go 1.21's `slices.Compare` and `cmp.Compare` allow for efficient, allocation-free lexicographical comparison of struct fields and slices.
**Action:** Optimized `ParseInvariant` in `internal/i18n/icuparser/invariant.go` by replacing string-joining logic with `slices.SortFunc` and `slices.Compare`, resulting in a ~2.9x speedup and ~20% fewer allocations.

## 2026-06-01 - Eliminating O(N^2) slice prepending
**Learning:** Prepending to a slice using `append([]T{item}, slice...)` is (N^2)$ due to repeated allocations and data copying. For building paths or lists that should be in reverse order, it is significantly more efficient to append normally ((N)$) and call `slices.Reverse` once at the end.
**Action:** Optimized `markdownNodePath` and `stripTrailingJSXClosingLiterals` in `internal/i18n/translationfileparser` by switching to append+reverse, resulting in ~2.4x to ~6x speedups and ~10x fewer allocations.

## 2026-06-01 - Preferring strconv.Itoa over fmt.Sprintf in hot paths
**Learning:** `fmt.Sprintf` is flexible but expensive due to reflection and parsing the format string. For simple integer conversions, `strconv.Itoa` is much faster and avoids unnecessary overhead.
**Action:** Replaced `fmt.Sprintf("%s[%d]", ...)` with string concatenation and `strconv.Itoa` in `markdownNodePath`, contributing to a ~6x performance improvement.

## 2026-06-05 - Optimizing recursive JSON flattening
**Learning:** In recursive tree/map traversal (like `flattenJSON`), using `fmt.Sprintf` for key construction at every level accumulates significant allocation and formatting overhead. String concatenation with `strconv.Itoa` is considerably more efficient for these hot paths.
**Action:** Replaced `fmt.Sprintf("%s[%d]", ...)` with manual concatenation in `internal/i18n/translationfileparser/json_parser.go`.

## 2026-06-10 - Optimizing recursive JSON marshaling
**Learning:** Similar to `flattenJSON` in the parser, using `fmt.Sprintf` for key construction in recursive JSON rewriting (e.g., `rewriteJSONArray`) adds significant allocation and formatting overhead. String concatenation with `strconv.Itoa` is a much more efficient alternative for these hot paths.
**Action:** Replaced `fmt.Sprintf("%s[%d]", ...)` with manual concatenation in `internal/i18n/translationfileparser/json_marshal.go`.

## 2026-06-12 - Optimizing segment key and placeholder generation across parsers
**Learning:** Hot paths in parser logic, such as segment key generation, hashing for placeholders, and path construction, accumulate significant overhead when using `fmt.Sprintf`. String concatenation combined with `strconv.Itoa` is a much more efficient alternative, reducing reflection and formatting costs.
**Action:** Replaced `fmt.Sprintf` with concatenation and `strconv.Itoa` in `html_parser.go`, `markdown_parser.go`, `liquid_parser.go`, and `markdown_mdx_parser.go`.

## 2026-05-21 - Optimizing ICU block formatting
**Learning:** Using `fmt.Sprintf` with the reflection-based `%v` verb inside a loop to format complex structs (like `BlockSignature`) is a major performance bottleneck. Manual formatting with `strings.Builder` and `strconv.Itoa` avoids reflection and significantly reduces allocations.
**Action:** Replaced `fmt.Sprintf` with manual formatting in `FormatICUBlocks`, resulting in a ~6.6x speedup and ~72% fewer allocations.

## 2026-06-15 - Optimizing Markdown segment and placeholder generation
**Learning:** Hot paths in Markdown parsing, such as frontmatter path generation, table row pathing, and placeholder hashing, benefit significantly from replacing `fmt.Sprintf` with string concatenation and `strconv.Itoa`. This reduces reflection overhead and allocations in paths that may be called thousands of times for large documents.
**Action:** Replaced `fmt.Sprintf` with concatenation and `strconv.Itoa` in `internal/i18n/translationfileparser/markdown_md_parser.go`.
