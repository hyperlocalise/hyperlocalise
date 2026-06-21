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

## 2026-06-18 - Optimizing YAML segment key generation
**Learning:** Hot paths in YAML parsing and marshaling, such as recursive segment key generation for sequences (e.g., `prefix[idx]`), benefit significantly from replacing `fmt.Sprintf` with string concatenation and `strconv.Itoa`. This reduces reflection overhead and allocations in deep document trees.
**Action:** Replaced `fmt.Sprintf("%s[%d]", ...)` with manual concatenation in `internal/i18n/translationfileparser/yaml_parser.go` and `yaml_marshal.go`.

## 2026-06-20 - Optimizing XCStrings path and key construction
**Learning:** XCStrings parsing involves frequent recursive construction of path labels (e.g., `strings.KEY.localizations.LOCALE`). Using `fmt.Sprintf` for these labels in loops or recursion introduces significant reflection overhead. String concatenation is a much more efficient alternative.
**Action:** Replaced `fmt.Sprintf` with string concatenation in `internal/i18n/translationfileparser/xcstrings_parser.go`, resulting in ~10% faster parsing and ~14% fewer allocations.

## 2026-07-28 - Eliminating O(N²) line-number counting in sequential parsers
**Learning:** Repeatedly calling a function that scans the entire prefix of a file to count newlines (e.g., `lineNumberAt(text, offset)`) inside a parser loop leads to $O(N^2)$ complexity. For sequential parsers, tracking a `currentLine` counter incrementally as the parser advances is significantly more efficient ($O(N)$).
**Action:** Updated `JavaPropertiesParser` and `AppleStringsParser` to track line numbers incrementally, avoiding massive slowdowns on large localization files.

## 2026-07-30 - Fast-paths for single-line properties in escaped formats
**Learning:** For formats that support logical line continuations (like Java `.properties`), allocating a `strings.Builder` and a "mapping" slice for every line adds significant GC pressure. Since most properties are single-line, a fast-path that uses raw string slices and a `nil` mapping avoids these allocations entirely.
**Action:** Implemented a fast-path in `readPropertiesLogicalLine` for the common case, contributing to a ~2.5x speedup and ~80% reduction in allocations.

## 2026-08-01 - Eliminating redundant sorting and O(N²) line counting in parsers
**Learning:** For sequential parsers, entries are naturally collected in document order. Explicitly cloning and sorting them again in `render` methods introduces $O(N \log N)$ CPU overhead and $O(N)$ allocations. Additionally, calling O(N) line-counting helpers in a loop creates $O(N^2)$ complexity; tracking `currentLine` incrementally during linear scanning is $O(N)$. Finally, using `strings.Builder.Grow(len(template))` in renderers avoids multiple re-allocations and data copies.
**Action:** Removed redundant sorting and added allocation hints to `AndroidXMLResourcesParser`, `AppleStringsParser`, `JSTSLocaleModuleParser`, and `JavaPropertiesParser`. Implemented incremental line tracking in `parseAndroidResourceDocument`.

## 2026-05-23 - Optimizing PHP array path construction
**Learning:** In recursive tree/array traversal (like PHP array parsing), using a `[]string` slice to track the path leads to $O(N^2)$ complexity and high allocations due to repeated slice copies and `strings.Join` calls. Passing a pre-concatenated `string` prefix is much more efficient.
**Action:** Refactored `PHPArrayParser` to use a `string` prefix for pathing, consistent with other optimized parsers in the codebase.

## 2026-05-24 - Optimizing Unicode escape encoding
**Learning:** Using `fmt.Fprintf` for simple hex encoding (like Unicode escapes `\uXXXX`) is expensive due to reflection and formatting overhead. Manual hex encoding using a lookup table and bit shifting is significantly faster (~5x) and avoids reflection.
**Action:** Replaced `fmt.Fprintf` with manual hex encoding in `properties_parser.go` and `js_ts_locale_parser.go`, and centralized the `hexDigits` constant in `strategy.go`.

## 2026-06-25 - Optimizing GenericXMLParser path construction and sorting
**Learning:** Constructing full path slices ((Depth^2)$ allocations) for every element in an XML tree is a significant bottleneck during parsing. Deferring key resolution to (Depth)$ reconstruction from the stack only for translatable leaves, combined with replacing reflection-based `sort.Slice` with `slices.SortFunc`, provides measurable efficiency gains.
**Action:** Refactored `GenericXMLParser` to use a stack-based key reconstruction and `slices.SortFunc`, resulting in ~23% faster parsing and ~18% faster rendering for deep XML structures.

## 2026-07-10 - Optimizing Android XML path validation and value encoding
**Learning:** Manual path segment inspection is significantly more efficient than `strings.Split` for path validation in high-frequency scanning. Additionally, a fast-path for plain text in XML encoding (checking for `<` or `&`) avoids the high overhead of `xml.Decoder` for well-formedness checks.
**Action:** Refactored `isAndroidStringResourcePath` to avoid allocations and added a fast-path to `encodeAndroidResourceValue`, resulting in ~1.8x and ~1.2x speedups respectively.

## 2026-07-10 - Using strings.Count for fast newline counting
**Learning:** A manual loop to count newlines is significantly slower than `strings.Count`, which leverages highly optimized (often SIMD) internal implementations.
**Action:** Replaced manual byte-loop in `lineNumberAt` with `strings.Count`, achieving a ~16x performance improvement.

## 2026-07-15 - Fast-path for XLIFF fragment encoding
**Learning:** Initializing an `xml.Decoder` for every translation segment in XLIFF marshaling is expensive. Most segments are plain text. A fast-path `!strings.ContainsAny(value, "<&")` allows skipping the decoder for plain text, reducing allocations by ~20% and improving speed by ~15%.
**Action:** Use fast-path checks for plain text when wrapping/unwrapping XML fragments in translation marshaling.

## 2026-07-15 - Optimizing PO file line processing
**Learning:** `strings.Split(string(content), "\n")` allocates a large slice of strings, which is memory-intensive for large PO files. Manual iteration with `strings.IndexByte` reduces peak memory and allocations.
**Action:** Replace `strings.Split` with manual `strings.IndexByte` loops for large text file processing.

## 2026-07-20 - Fast-path and pre-allocation for mustache placeholder normalization
**Learning:** In the ICU parser's fallback path, `normalizeMustachePlaceholders` was always allocating a `strings.Builder` and performing byte-by-byte iteration even when no mustache placeholders (`{{`) were present. A simple `strings.Contains` fast-path avoids these allocations entirely for the common case.
**Action:** Implement `strings.Contains(s, "{{")` fast-path and use `strings.Builder.Grow` to minimize allocations in hot parsing paths.

## 2026-07-25 - ASCII fast-paths for ICU identifier and selector parsing
**Learning:** Message parsing and invariant extraction in the ICU parser are hot paths where `utf8.DecodeRuneInString` and `unicode` package checks (like `unicode.IsSpace` or `unicode.IsLetter`) add significant overhead when the input is predominantly ASCII.
**Action:** Implement manual byte-loop fast-paths for ASCII characters in `readIdentifierLike`, `readSelector`, and `isPlaceholderName` to bypass rune decoding. Additionally, use a single-character lookahead (e.g., `sel[0] == 'o'`) to short-circuit expensive `strings.EqualFold` calls for fixed keywords like `offset:`.

## 2026-07-28 - Optimizing Apple .stringsdict path construction and key validation
**Learning:** In recursive or iterative XML path construction (like .stringsdict parsing), using a `[]string` slice to track the path leads to high allocations due to repeated slice copies and `strings.Join` calls. Additionally, using `strings.Split` for segment extraction in validation is inefficient. String concatenation for path building and `strings.LastIndexByte` for segment extraction are significantly more efficient.
**Action:** Refactored `AppleStringsdictParser` to use a `string` path prefix and replaced `strings.Split` with `strings.LastIndexByte` in `validateStringsdictFormatKeys`, resulting in a ~10% speedup and ~7% reduction in allocations.

## 2026-07-30 - Caching strings.Replacer for static string escaping
**Learning:** `strings.NewReplacer` performs pre-computation (building a trie) on initialization. Rebuilding it inside a function called frequently (like `encodeAppleStringsQuoted`) introduces significant overhead. Moving it to a package-level variable allows the trie to be built once and reused.
**Action:** Moved `strings.NewReplacer` to a package-level variable in `internal/i18n/translationfileparser/strings_parser.go`, resulting in a ~9x speedup for string escaping.

## 2026-05-31 - Safe XLIFF token buffering and raw slicing
**Learning:** Go's `xml.Decoder` reuses internal buffers for tokens (like attributes). Storing tokens in a slice for later processing (e.g., to eliminate a second pass in `MarshalXLIFF`) requires deep cloning via a `cloneXMLToken` helper to avoid data corruption. Additionally, `xml.Encoder` by default expands self-closing tags (e.g., `<ph/>` to `<ph></ph>`), so raw slicing in `Parse` requires a normalization step for elements with nested markup to maintain functional parity with previous behavior.
**Action:** Implemented `cloneXMLToken` for safe buffering and used a conditional normalization helper in `XLIFFParser.Parse` to balance speed and correctness.

## 2026-06-01 - Optimizing ARB parsing via single-pass and map hinting

## 2026-09-01 - Optimizing GenericXMLParser via single-pass and allocation avoidance
**Learning:** XML parsing hot paths, especially `xml.CharData` and attribute scanning, can be significant allocation bottlenecks. Converting `[]byte` tokens to `string` just for whitespace checks or multiple passes over attributes for key discovery adds avoidable overhead. Custom byte-level checks (`isAllXMLWhitespace`) and single-pass priority-based scans are much more efficient.
**Action:** Use `isAllXMLWhitespace([]byte)` instead of `strings.TrimSpace(string(token))` in XML/HTML parsers and refactor attribute lookups into single-pass scans.

## 2026-08-05 - Optimizing Fluent parsing and marshaling
**Learning:** High-level string operations like `strings.Split`, `strings.Join`, and `strings.ReplaceAll` in recursive or iterative document processing (like Fluent parsing) accumulate significant allocation overhead. Replacing them with single-pass loops using `strings.Builder` and pre-allocating slices using `strings.Count` for line counting yields substantial performance gains.
**Action:** Optimized `scanFluentLines`, `encodeFluentValue`, `normalizeFluentValue`, `formatFluentComments`, and `render` in `internal/i18n/translationfileparser/fluent_parser.go`.

## 2026-08-10 - Optimizing JSONC comment parsing and stack management
**Learning:** In recursive or stateful parsing (like JSONC comment extraction), repeated use of `bytes.Split` and `strings.Join` for path management (e.g., `stackPrefix`) leads to significant allocation overhead. Replacing `bytes.Split` with manual `bytes.IndexByte` iteration and managing the stack prefix incrementally (concatenating on push, slicing on pop) provides measurable efficiency gains.
**Action:** Optimized `parseJSONCKeyComments` in `internal/i18n/translationfileparser/jsonc_parser.go`, achieving ~7.4% faster parsing and ~8% fewer allocations.

## 2026-08-15 - Optimizing JSON and FormatJS parsing
**Learning:** Sorting keys before iterating over a map to populate another map (like in JSON flattening or FormatJS extraction) adds O(N log N) overhead and extra allocations for no benefit, as Go maps are unordered. Additionally, combining multiple validation and extraction passes into a single loop significantly reduces CPU time for specialized formats.
**Action:** Removed redundant `slices.Sort` calls in `flattenJSON` and combined three passes (validation, message extraction, description extraction) into one in `parseFormatJS`, resulting in a ~16% speedup for standard JSON and ~17% for FormatJS.

## 2026-08-20 - Optimizing CSV parsing and marshaling via streaming
**Learning:** Loading entire files into memory using `csv.ReadAll` is a major bottleneck for large translation files. A streaming approach using `csv.Reader.Read` and `csv.Writer.Write` allows processing files row-by-row, significantly reducing peak memory usage.
**Action:** Refactored `CSVParser.Parse` and `MarshalCSV` to use streaming I/O, resulting in ~32% fewer allocations for parsing and ~38% fewer for marshaling, while improving marshaling speed by ~32%.

## 2026-08-25 - Optimizing Markdown and YAML line processing
**Learning:** Using `strings.SplitAfter` or `bytes.Split` on large translation files creates significant memory pressure by allocating large slices of string/byte pointers. Replacing these with manual `IndexByte` loops allows for streaming line-by-line processing with zero intermediate slice allocations. Additionally, unconditional `strings.ReplaceAll` for CRLF normalization on `[]byte` should be avoided; using a `bytes.Contains` fast-path and `bytes.ReplaceAll` directly avoids expensive `[]byte` <-> `string` conversions.
**Action:** Refactored line splitting in Markdown, MDX, and YAML parsers and implemented CRLF fast-paths.

## 2026-08-30 - Optimizing PO parser and marshaler via fast-paths and deferred allocations
**Learning:** strconv.Unquote and strconv.Quote always perform heap allocations even for simple strings. Implementing fast-paths for strings without escape sequences or special characters significantly reduces allocations. Additionally, using a utility struct to defer strings.Builder initialization until multiple string segments (continuations) are encountered avoids builder overhead for the common single-line case. Reusing the builder via Reset() across entries further reduces GC pressure.
**Action:** Refactored POFileParser and MarshalPOFile in internal/i18n/translationfileparser/po_parser.go with fast-paths and a deferred-allocation poValue struct, resulting in a ~98-99% reduction in allocations and measurable speedups.

## 2026-09-05 - Optimizing ICU parser scanning via IndexByte and IndexAny
**Learning:** Manual byte-by-byte loops in parsers are significant bottlenecks for long literal segments, quoted text, or tags with many attributes. Leveraging Go's optimized `strings.IndexByte` and `strings.IndexAny` (which often use SIMD) for "pure literal" scanning provides a significant performance boost for these inputs while maintaining correctness for escape sequences like doubled apostrophes (\'\').
**Action:** Replaced manual loops in `skipTagAttributeQuotedLiteral`, `consumeQuotedInto`, `skipQuotedLiteral`, and `parseUntilClosingTag` with standard library scanning functions.

## 2026-09-10 - Optimizing Android XML parser and marshaler
**Learning:** For XML parsing and marshaling: 1) `io.MultiReader` can be slower than simple string concatenation when feeding `xml.NewDecoder` due to increased call overhead and potential loss of internal buffering optimizations; 2) Lazy `strings.Builder` initialization combined with single-pass loops is superior to multi-pass "fast-path" checks when the common case is a lack of the target feature (e.g., namespaces); 3) Heuristic slice capacity hints (e.g., `len(input)/80`) effectively reduce reallocations in tree-based parsers.
**Action:** Refined `AndroidXMLResourcesParser` to use lazy builder initialization, single-pass namespace scanning, and slice capacity hinting, while reverting a counter-productive `io.MultiReader` optimization.

## 2026-06-10 - Optimizing PHP array parsing and marshaling
**Learning:** Re-creating `strings.NewReplacer` in a hot loop is extremely expensive due to internal trie construction. Additionally, redundant `slices.Sort` calls on segments that are already in document order and missing `strings.Builder.Grow` hints in renderers are significant avoidable overheads.
**Action:** Move `strings.NewReplacer` to package-level variables for static rules. Use `strings.Builder.Grow` in renderers. Remove redundant sorting by ensuring parsers produce ordered segments.

## 2026-10-05 - Precomputing syntax counts and optimizing scanning
**Learning:** Repeatedly scanning the same source strings for syntax validation (e.g., `IntroducesRawHTMLSyntax`) during rendering creates $O(N)$ overhead per segment that can be avoided by precomputing counts during parsing. Additionally, manual byte-by-byte loops for character searching (like finding '<') are significantly slower than Go's optimized `strings.IndexByte`.
**Action:** Precompute `sourceSyntaxCount` during parsing for HTML/Markdown parts and store it in the struct. Optimize `rawHTMLSyntaxStartCount` using `strings.IndexByte` for faster character discovery.

## 2026-09-15 - Optimizing ARB marshaling via string fast-paths and partial sorting
**Learning:** For JSON-based formats like ARB, bypassing `json.Marshal` for simple ASCII strings and avoiding full map sorts when only a few keys are new provides significant efficiency gains. Heuristic capacity hints for maps and slices also minimize GC pressure during large file processing.
**Action:** Implemented `isSimpleJSONString` fast-path and refactored `MarshalARB` to sort only new keys, resulting in ~11-18% speedup and reduced allocations.

## 2026-09-20 - Optimizing XML attribute lookup priority
**Learning:** Functions that need to find one of several attributes with a specific priority (e.g., id > name > resname) are often implemented using multiple passes over the attribute slice. A single-pass scan with priority tracking is more efficient as it reduces iterations and potentially redundant string operations like TrimSpace.
**Action:** Use single-pass attribute scanning for priority-based lookups and centralize common XML helpers to avoid redundant processing.

## 2026-06-14 - Optimizing multiline string normalization in Fluent parser
**Learning:** Sequential use of `strings.ReplaceAll`, `strings.Split`, and `strings.Join` for line-by-line processing of multiline strings (e.g., CRLF normalization and indentation removal) creates excessive intermediate heap allocations. A manual scanning approach that tracks line boundaries via indices and uses `strings.Builder` for final assembly is much more memory-efficient.
**Action:** Refactored `normalizeFluentValue` in `internal/i18n/translationfileparser/fluent_parser.go` to use manual line scanning, reducing allocations and improving performance for large Fluent files.

## 2026-09-25 - Optimizing XLIFF parser and marshaler via allocation reduction
**Learning:** XLIFF parsing and marshaling are allocation-intensive due to frequent XML token cloning and unit state management. Reusing `xliffUnit` structs with `bytes.Buffer` resets, hinting map capacity, and avoiding heap-allocated state pointers provides measurable efficiency gains. Additionally, refining `cloneXMLToken` to skip allocations for empty/nil slices further reduces GC pressure.
**Action:** Optimized `internal/i18n/translationfileparser/xliff_parser.go` by reusing unit buffers, pre-allocating token slices, and replacing heap pointers with stack-based variables, resulting in a ~22% reduction in allocations and improved speed.

## 2026-10-10 - Optimizing Apple Stringsdict parser and renderer
**Learning:** XML-based pluralization formats like stringsdict benefit significantly from document-order processing. Since the XML decoder visits tokens sequentially, entries can be collected in order, allowing the renderer to bypass expensive sorting and cloning. Additionally, heuristic capacity hints for stacks and maps in recursive-like XML structures (nested dicts) reduce GC pressure.
**Action:** Removed redundant sorting/cloning in `render` and implemented capacity hints in `parseStringsdictDocument` and helpers in `internal/i18n/translationfileparser/stringsdict_parser.go`.

## 2026-10-15 - Optimizing Liquid parser via byte-level scanning and allocation reduction
**Learning:** For template parsers that perform masking or delimiter scanning: 1) converting the entire input to a string is an avoidable large allocation; 2) manual byte-by-byte loops for literal text can be replaced with `bytes.IndexAny` to skip uninteresting segments; 3) `fmt.Sprintf`, `hex.EncodeToString`, and `strings.ToUpper` in hot-path token generation create significant GC pressure that can be mitigated with stack buffers and manual hex tables.
**Action:** Optimized `maskLiquidSyntax`, `liquidPlaceholderToken`, `liquidSegmentKey`, and associated helpers in `internal/i18n/translationfileparser/liquid_parser.go`.
