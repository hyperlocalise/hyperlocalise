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
**Learning:** For sequential JSON-based formats like ARB, the standard `json.Unmarshal` for metadata extraction can be slow due to multiple passes and redundant string operations. A single-pass scan of the object fields allows for simultaneous message key collection and metadata indexing. Replacing `strings.HasPrefix`/`TrimPrefix` with direct indexing and slicing further reduces allocations.
**Action:** Optimized `arbMessageMetadataFields` and `MarshalARB` in `internal/i18n/translationfileparser/arb_parser.go` by implementing single-pass field scanning and direct string indexing.

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

## 2026-10-18 - Eliminating O(N²) allocations in whitespace checks and optimizing case-insensitive comparisons
**Learning:** Performing `string(data)` conversion inside a loop (as seen in the original `isAllXMLWhitespace`) leads to $O(N^2)$ allocations. Replacing this with a zero-allocation `utf8.DecodeRune` loop and a fast-path for ASCII significantly improves efficiency. Additionally, replacing `strings.ToLower(strings.TrimSpace(name))` with `strings.EqualFold(strings.TrimSpace(name), ...)` avoids unnecessary string allocations during repeated name checks.
**Action:** Refactored and optimized whitespace checks and tag name comparisons in `internal/i18n/translationfileparser/generic_xml_parser.go` and centralized utilities in `xml_util.go`.

## 2026-10-20 - Optimizing JSONC comment parsing via manual byte scanning
**Learning:** Replacing line-by-line regular expression matching with a manual `[]byte` scanner and avoiding per-line `string` conversions significantly reduces allocation overhead and CPU time in translation file parsers. Regex overhead, especially for simple key/value patterns, is often a hidden bottleneck compared to optimized byte scanning.
**Action:** Optimized `parseJSONCKeyComments` and its helper functions in `internal/i18n/translationfileparser/jsonc_parser.go` to operate entirely on `[]byte`, resulting in a ~30% speedup and ~17% fewer allocations.

## 2026-10-25 - Optimizing XCStrings parser and marshaler via sort elimination and string building
**Learning:** For structured catalog formats like Apple's XCStrings (JSON-based), intermediate O(N log N) sorting of map keys during traversal is often redundant and adds significant CPU/allocation overhead for large files. Direct map iteration is sufficient when the final output is either a map or passed to `json.MarshalIndent` (which sorts keys internally). Additionally, using `strings.Builder` with heuristic `Grow` hints for compound key and multiline context generation further reduces allocation pressure.
**Action:** Removed redundant sorting and refactored string/slice manipulation in `internal/i18n/translationfileparser/xcstrings_parser.go`.

## 2027-01-15 - Low-copy literal tracking and inlining in ICU parser
**Learning:** In ICU message parsing, literal text dominates many inputs. Implementing a "low-copy" tracking approach using `lastPos` allows literal segments to be sliced directly from the source string, bypassing `strings.Builder` and avoiding redundant string copies for segments that don't require unescaping. Additionally, inlining hot-path helper functions and providing heuristic slice capacity hints (e.g., cap 4 for elements) reduces function call overhead and GC pressure.
**Action:** Refactored `internal/i18n/icuparser/parse.go` to use `lastPos` tracking and inlined internal helpers, resulting in ~25-40% faster parsing and ~30-50% fewer allocations.

## 2026-06-26 - Optimizing CSV parser and marshaler via capacity hints
**Learning:** For sequential parsers and marshalers like CSV, the output size (map entries or buffer bytes) is often proportional to the input size. Providing heuristic capacity hints to maps and buffers significantly reduces re-allocations and GC pressure during processing of large files.
**Action:** Implemented map capacity hints in `Parse` and buffer growth hints in `MarshalCSV` in `internal/i18n/translationfileparser/csv_parser.go`, resulting in ~12-16% speedups.

## 2027-02-10 - Optimizing Java Properties comment formatting and extraction
**Learning:** Using `strings.Join` and `strings.TrimSpace` on a per-entry basis during translation extraction creates significant allocation overhead. A custom helper using `strings.Builder` with capacity hints, combined with pre-allocating the results map, measurably improves performance. Additionally, slice reuse for pending comments must be handled with care to avoid data corruption across entries.
**Action:** Implemented `formatPropertiesComments` and map pre-allocation in `internal/i18n/translationfileparser/properties_parser.go`, resulting in ~15% faster extraction and ~9% fewer bytes allocated.

## 2027-02-15 - Optimizing locale list normalization via capacity hinting and allocation avoidance
**Learning:** For functions that perform string splitting and deduplication (like `NormalizeList`), pre-calculating the total expected elements (e.g., by counting delimiters) to provide accurate map and slice capacity hints significantly reduces re-allocation overhead. Additionally, manual checks for common string states (like `isAlreadyLower` for ASCII) can bypass expensive standard library calls that might otherwise perform redundant allocations.
**Action:** Implement capacity hints based on delimiter counts and use fast-path checks for common string properties to avoid unnecessary heap allocations in hot-path utility functions.

## 2027-02-20 - Optimizing HTML tag parity checks via fast-paths and allocation reduction
**Learning:** HTML tag parity checks are frequently performed during translation validation. Repeated use of `strings.TrimSpace`, `strings.TrimPrefix`, `strings.TrimSuffix`, and `strings.Fields` in a loop creates significant garbage collection pressure due to many intermediate string allocations. A manual scanning approach that extracts tag names in a single pass is much more efficient. Additionally, a simple fast-path for identical strings avoids expensive parsing entirely for the most common case.
**Action:** Implement fast-paths for identical inputs and replace chained string manipulation functions with manual index-based scanning in hot paths like tag discovery and normalization.

## 2027-02-25 - Optimizing segment profile validation via caching and allocation avoidance
**Learning:** In segment validation, `normalizeProfileText` repeatedly constructs `strings.NewReplacer`, which is expensive due to internal trie building. Additionally, `profileEdgeWhitespace` uses `[]rune(value)` for scanning, which creates $O(N)$ heap allocations.
**Action:** Move `strings.NewReplacer` to a package-level variable with a `strings.Contains` fast-path in `normalizeProfileText`. Refactor `profileEdgeWhitespace` to use manual `utf8.DecodeRuneInString` and `utf8.DecodeLastRuneInString` loops, resulting in ~1.6x faster overall segment validation and zero allocations for whitespace edge discovery.

## 2027-02-28 - Optimizing JS/TS locale module parsing and encoding via fast-paths and capacity hints
**Learning:** For language-specific module parsers (like JS/TS) that perform heavy string manipulation: 1) simple quoted strings without escapes are extremely common and can be sliced directly from the source using `strings.IndexAny` to avoid `strings.Builder` allocations; 2) encoding simple ASCII strings can bypass expensive UTF-8 decoding and builder overhead via a pre-scan; 3) heuristic capacity hints for slices (entries, properties, array items) based on input size significantly reduce GC pressure during large file processing.
**Action:** Implemented fast-paths for string literal parsing/encoding and added capacity hints in `internal/i18n/translationfileparser/js_ts_locale_parser.go`, resulting in ~14.5% faster marshaling and ~17-34% fewer allocations.

## 2026-07-10 - Optimizing PHP array parser and marshaler via buffer reuse and direct scanning
**Learning:** For sequential marshalers that replace multiple placeholders in a template, switching from `strings.Builder` to `bytes.Buffer` and using `strings.Replacer.WriteString` directly into the buffer eliminates O(N) intermediate string allocations and the final `[]byte(b.String())` copy. Additionally, replacing `strings.HasPrefix` with direct byte comparisons in hot scanning loops for trivia and comments measurably reduces function call overhead. Tuning capacity hints for parsers based on format density (e.g., /32 for PHP arrays) further minimizes heap re-allocations.
**Action:** Refactored `render`, `writePHPStringLiteral`, and `skipPHPTrivia` in `internal/i18n/translationfileparser/php_array_parser.go`, resulting in ~10-15% faster performance and near-zero per-entry allocations during marshaling.

## 2026-07-11 - Optimizing ARB marshaling and learning about JSON decoding overhead
**Learning:** For schema-heavy JSON formats like ARB (where message keys are paired with metadata objects), implementing a custom token-based decoder using `json.RawMessage` can surprisingly be significantly slower (~85%) and more allocation-heavy (3x) than a single `json.Unmarshal` into `map[string]any`. This is likely due to the overhead of multiple unmarshal calls and map insertions for individual fields compared to the optimized internal implementation of `json.Unmarshal`. However, for marshaling, replacing intermediate `[]byte` allocations for keys and values with direct writing to a `bytes.Buffer` using a custom `writeJSONString` helper provides a measurable speedup.
**Action:** Optimized `MarshalARB` and `marshalJSONString` in `internal/i18n/translationfileparser/arb_parser.go` to use direct buffer writing, resulting in a ~33% improvement in marshaling speed for large files.

## 2026-07-12 - Optimizing YAML parser and marshaler map allocations
**Learning:** For recursive structure flattening into maps (like YAML or JSON), Go maps start small and grow dynamically, causing expensive re-allocations and re-hashing. Heuristic capacity hints based on input size or AST node content size significantly reduce this overhead.
**Action:** Use `make(map[string]string, len(content)/64)` for raw byte inputs and `make(map[string]string, len(node.Content)/2)` for AST-based mapping nodes in translation parsers.

## 2026-07-13 - Optimizing Apple .strings parser and renderer via fused scanning and buffer writing
**Learning:** For sequential parsers that track line numbers, calling `strings.Count` on each segment after scanning is redundant. Fusing newline counting into the primary byte-scanning loops (whitespace, trivia, and tokens) makes line tracking essentially "free" and avoids multiple (N)$ passes over the input string. For renderers producing `[]byte`, using `bytes.Buffer` and returning `b.Bytes()` directly avoids a redundant string allocation and copy. Furthermore, using `Replacer.WriteString` directly into the buffer eliminates intermediate allocations for escaped strings.
**Action:** Refactored `parseStringsDocument`, `render`, and scanning helpers in `internal/i18n/translationfileparser/strings_parser.go`, resulting in ~9% faster parsing and ~15% faster marshaling with reduced allocations.

## 2026-07-14 - Optimizing extra placeholder extraction
**Learning:** Combining multiple independent regex patterns into a single alternation regex () significantly reduces the number of scanning passes over the input string (from N passes to 1). Furthermore, simple `strings.ContainsAny` checks for signal characters (like '%' or '$') serve as highly effective fast-paths to avoid regex execution overhead entirely for non-placeholder text.
**Action:** Use combined regexes and `ContainsAny` fast-paths in high-frequency validation or parsing logic.

## 2025-05-15 - Optimizing extra placeholder extraction
**Learning:** Combining multiple independent regex patterns into a single alternation regex (`a|b|c`) significantly reduces the number of scanning passes over the input string (from N passes to 1). Furthermore, simple `strings.ContainsAny` checks for signal characters (like '%' or '$') serve as highly effective fast-paths to avoid regex execution overhead entirely for non-placeholder text.
**Action:** Use combined regexes and `ContainsAny` fast-paths in high-frequency validation or parsing logic.

## 2026-07-15 - Fast-path for special char extraction and ASCII hex check
**Learning:** In segment profile validation, `extractSpecialCharLiterals` was allocating a map and scanning every character even for simple strings without escape sequences. A `strings.Contains(value, "\\")` fast-path avoids this. Additionally, `isHexDigits` was using expensive UTF-8 rune decoding for ASCII-only hex characters.
**Action:** Implemented backslash fast-path and byte-loop hex check, resulting in ~6.6x and ~3x speedups respectively for those functions.

## 2027-03-01 - Optimizing Java Properties key/value encoding and avoiding memory-pinning hazards
**Learning:** Adding needs-escaping fast-paths to key and value encoding functions is incredibly effective, avoiding any `strings.Builder` and runtime string allocations for safe, plain-text strings. However, attempting to remove `strings.Clone(raw)` during parsing to save allocations introduces memory-pinning risks, where keeping sub-sliced keys/values in memory prevents the garbage collection of the entire raw file buffer.
**Action:** Implemented needs-escaping fast-paths in `encodeJavaPropertiesKey` and `encodeJavaPropertiesValue` to reduce allocations by ~58.7% and speed up marshaling by ~21.0%, while preserving the safe `strings.Clone` behavior in the parser to protect against long-term memory footprint bloat.

## 2027-03-02 - Streaming XML marshalling and zero-allocation tag scanning
**Learning:** Buffering and cloning `xml.Token` instances (such as `xml.CharData` or `xml.StartElement`) to inspect translation unit contents before modifying them creates massive GC and heap allocation overhead in XML/XLIFF documents. Instead, streaming tokens on-the-fly and selectively bypassing nested children under skipped tags completely avoids intermediate token buffering. Furthermore, scanning for a tag's presence using raw byte scanning that skips comments and CDATA is 100% correct, avoids prefix-matching bugs, and achieves a completely zero-allocation pre-scan.
**Action:** Stream XML tokens directly to the encoder on-the-fly, and use light-weight, zero-allocation raw byte-level scanners to inspect boundaries and tag presence within raw template slices instead of instantiating secondary stateful parsers.

## 2027-03-05 - Multi-string fast-paths in translation validator with parity safeguards
**Learning:** In translation segment validation, plain text strings (which represent 60-90% of translation segments) don't have ICU or HTML formatting. Bypassing AST parsing using `strings.ContainsAny(source, "{<")` is extremely fast. However, doing so for only the `source` text is a critical functional regression because the translator could introduce extra or malformed ICU braces/HTML tags in the translation. The fast-path bypass is only safe and correct when both the source and target contain no structural delimiters.
**Action:** Implemented a dual-string fast-path check `if !strings.ContainsAny(source, "{<") && !strings.ContainsAny(translated, "{<")` in `validateICUInvariant` to ensure complete safety while preserving the 2x speedup and 75% memory reduction.

## 2027-03-08 - Optimizing segment edge whitespace scanning and whitespace signal checking
**Learning:** For segment edge whitespace profiling, we can completely bypass expensive rune-by-rune scanning and decoding (`utf8.DecodeRuneInString` / `utf8.DecodeLastRuneInString`) if the first and last bytes are ASCII non-whitespace, since UTF-8 guarantees any byte `< 0x80` is a single-byte ASCII codepoint. Additionally, `strings.Contains` is significantly faster than `countNBSP > 0` for checking presence of non-breaking spaces because it returns early on the first match.
**Action:** Implemented ASCII byte-level fast-path check in `profileEdgeWhitespace` and replaced `countNBSP` with `strings.Contains` in `hasProfileWhitespaceSignals`, reducing PlainASCII edge scanning to ~5.8 ns/op and 0 allocations.

## 2027-03-12 - Optimizing HTML tag parity checks via fast-paths and allocation reduction
**Learning:** HTML tag parity checks are frequently performed during translation validation. Repeated use of `strings.TrimSpace`, `strings.TrimPrefix`, `strings.TrimSuffix`, and `strings.Fields` in a loop creates significant garbage collection pressure due to many intermediate string allocations. A manual scanning approach that extracts tag names in a single pass is much more efficient. Additionally, a simple fast-path for identical strings avoids expensive parsing entirely for the most common case.
**Action:** Implement fast-paths for identical inputs and replace chained string manipulation functions with manual index-based scanning in hot paths like tag discovery and normalization.

## 2027-03-15 - Optimizing HTML tag parity checks via fused single-pass scanning and lookup caching
**Learning:** HTML tag sequence parity validation is a hot path during segment checking. 1) Using regular expression-based or multi-pass tag extraction (`findAllTags`) creates high memory allocation pressure due to intermediate slices and strings; fusing tag discovery, name extraction, and filtering into a single pass completely avoids allocating these intermediate buffers. 2) Bypassing `strings.ToLower` for tag names that are already lowercase ASCII (via `isAllLowerASCII`) prevents unnecessary heap allocations on standard inputs. 3) Converting a string to `[]byte` for `atom.Lookup` is expensive; a static package-level map of known HTML/SVG atoms (`htmlAtoms`) serves as a perfect fast-path that entirely eliminates these allocations.
**Action:** Fused tag parsing in `collectMarkupTags`, bypassed lowercase conversions for lowercase ASCII strings, and implemented `htmlAtoms` precomputed lookup map to reduce heap allocations in HTML/XML hot-paths.

## 2027-03-20 - Optimizing CLI scoring via map capacity hinting and loop Sprintf elimination
**Learning:** In Go CLI evaluations and text analysis, reflection-based formatting like `fmt.Sprintf` inside hot loops for token generation introduces substantial CPU and allocation overhead. Direct string concatenation combined with `strconv.Itoa` is a highly efficient, allocation-free alternative. Furthermore, pre-allocating map capacities when lower bounds (e.g., ICU placeholders/blocks counts) are known avoids multiple resizing and rehashing operations.
**Action:** Refactored `placeholderTokenCounts` in `apps/cli/internal/i18n/evalsvc/scoring/evaluator.go` to use capacity hinting and direct concatenation, yielding ~12% faster execution and ~18% fewer allocations.

## 2027-03-25 - Eliminating redundant parsing and scanning in segment validation
**Learning:** In CAT tool segment validation flows, performing multiple sequential/independent validation passes and then subsequently scanning/parsing the source strings all over again to determine token presence introduces substantial duplicate CPU and heap allocation overhead. Designing validations to extract and return formatting/token presence flags directly during the primary validation pass completely avoids these secondary rescans, reducing hot-path execution time by ~25-30% and allocations by ~30-35%.
**Action:** Implemented `WithTokens` suffix counterparts for core validation functions (`validateICUInvariant`, `validateProfileParity`, `validateExtraPlaceholderParity`, `validateWhitespaceProfile`, `validateSpecialCharParity`) to return a boolean flag indicating formatting/profile token presence. Captured these flags in `ValidateSegment` directly during the validation phase to eliminate redundant/duplicate parsing without breaking original function signatures or unit test expectations.

## 2027-03-28 - Optimizing scoring evaluation text normalization and token counting
**Learning:** In text scoring evaluators, high-volume string normalization and token counting often suffer from redundant allocation overhead (like chaining `strings.ToLower` and `strings.TrimSpace` on large volumes of segments) and regular expression parsing on strings without any placeholders/markup. Re-implementing normalization as a single-pass character loop, and shielding regular expressions behind simple signal-character checks (`Contains` and `ContainsAny`), yields massive performance boosts while preserving 100% functional equivalence.
**Action:** Always combine normalization steps (lowercase, trim, punctuation removal) into single-pass loops with pre-allocated builders, and guard regular expressions behind cheap signal character checks in high-frequency evaluation contexts.

## 2027-04-05 - Zero-allocation XML fragment scanning for Android XML marshaling
**Learning:** Initializing an `xml.Decoder` and allocating buffers to check XML well-formedness of translatable fragments (e.g. `<b>`, `<xliff:g ...>`) is highly CPU and allocation-intensive in sequential marshalers. Implementing a zero-allocation, single-pass fast-path scan using a small stack-allocated array (for tracking element index spans) allows verifying typical fragments instantly with zero allocations. If any complex syntax, unknown namespace, or malformed pattern is detected, it is completely safe to gracefully fall back to the slow, fully compliant `xml.Decoder`.
**Action:** Implement light-weight, stack-allocated fast-path scanners for XML/HTML segment validation to bypass heavy decoder instantiation.

## 2027-04-10 - Optimizing HTML tag sequence validation via pre-allocation and unsafe slice conversion
**Learning:** In HTML tag sequence checks, slice resizing and heap allocations from string-to-byte conversions inside high-frequency lookups (such as `atom.Lookup([]byte(tag))`) are main sources of GC pressure. Pre-allocating slice capacity with `strings.Count(s, "<")` avoids growth re-allocations entirely. Additionally, utilizing unsafe string data slicing (`unsafe.Slice` and `unsafe.StringData`) allows passing strings directly into functions taking `[]byte` with zero heap allocations, ensuring total safety when the function only reads the slice.
**Action:** Pre-allocate collection slices using fast delimiter counting, and employ unsafe zero-allocation conversion techniques for read-only byte slice parameters in hot-path validations.

## 2027-04-15 - Segment validation fast-paths for identical source/translated strings and allocation-free QA dispatching
**Learning:** In CAT tool translation validation flows, identical source and target strings are extremely common (e.g. untranslated strings, copy-pasted names, or non-translatable strings). In such cases, we can completely bypass duplicate parsing of the target's ICU invariant structure and profile tokens (extra placeholders, special characters). We only need to parse/extract them once from the source itself. Additionally, allocating a dynamic lookup map (like `map[string]struct{}`) for parsing a small, fixed set of active QA modes adds unnecessary heap allocation overhead. Replacing the map with simple byte/string casing inside a loop yields a completely allocation-free checks dispatcher.
**Action:** Implemented identical-string fast paths in `invariant.go` and `profile.go`, and refactored `qaChecks` in `qa.go` to use high-performance boolean flags instead of a `map[string]struct{}`, resulting in 16% to 51% faster validations and up to 51% fewer allocations.

## 2027-04-20 - Redundant Task Cache Hash Generation and Slice Allocations in planTasks
**Learning:** In CAT/planning services, we map each unique source key to multiple target locales. Precomputing cache key fields (like `sourceTextHash` and `sourceContextFingerprint`) repeatedly for every target locale creates significant hashing and allocation overhead ($O(K \times L)$). Precomputing them once per unique key in a source file ($O(K)$) and storing them in `plannedSourceSnapshot` avoids redundant SHA-512 computations. Additionally, using `slices.Grow` to size-hint the `tasks` slice prior to inner-loop appending eliminates repetitive slice copying. However, when mutating `SourceContext` during candidate hashing, we must clear the precomputed fingerprint to force recomputation on variants.
**Action:** Always precompute and cache locale-independent fields at the document/key level, use `slices.Grow` for sizing slices in nested loops, and ensure that any context/text mutation in candidate generation clears cached fingerprints.

## 2027-04-25 - On-the-fly ASCII fast-path in normalizeText and early return in termComplianceScore
**Learning:** In scoring evaluators, running `strings.ToLower` unconditionally inside `termComplianceScore` creates substantial redundant heap allocation overhead when no forbidden terms exist. Additionally, performing character-by-character Unicode decoding and checks (like `unicode.IsPunct` and `unicode.IsSpace`) inside `normalizeText` can be completely bypassed for ASCII characters by processing raw bytes directly.
**Action:** Always guard heavy lowercasing checks with size-gated early returns (e.g., check `len(forbiddenTerms) == 0`). For text normalization, implement a byte-level ASCII fast-path that bypasses rune decoding and unicode table functions entirely, yielding over 54% faster normalization speeds.

## 2027-04-30 - Eliminating duplicate map allocations in token F1 scoring
**Learning:** In text similarity scoring metrics like token F1, constructing separate frequency maps for both the reference and candidate strings is a major allocation bottleneck. Since we only need to count matching tokens (multiset intersection), we can construct and pre-allocate a single map for the reference tokens, then scan the candidate tokens and decrement the counts on the fly. This completely avoids allocating the candidate map and reduces overall evaluator allocations.
**Action:** Replaced the dual-map implementation in `tokenF1Normalized` with a single pre-allocated map and on-the-fly decrementing, reducing allocations per evaluation by 3.

## 2027-05-02 - Eliminating redundant parsing of root object properties in JS/TS locale module parser
**Learning:** In recursive nested structure flattening/extraction, parsing the entire root object start-to-end to extract properties can lead to a redundant secondary parsing pass when those properties are immediately flattened from scratch. Directly iterating over the already-parsed root properties list and flattening each element's value completely avoids this duplicate work, resulting in significant parsing and memory efficiency gains.
**Action:** Updated `parseJSTSLocaleEntries` in `internal/i18n/translationfileparser/js_ts_locale_parser.go` to iterate over the parsed properties slice directly instead of invoking `flattenJSTSLocaleValue` on the entire object range. This reduced allocations by 104 per parse operation and achieved ~10.7% faster parsing.

## 2027-05-05 - Fast-paths and pre-allocations in ICU parser invariant extraction
**Learning:** ICU invariant comparisons and deduplication are highly sensitive to slice growth and sorting overhead in CAT tools. Checking if slices are already sorted and unique via `isSortedAndUnique` bypasses clone, sort, and compact operations. Additionally, pre-allocating `Placeholders` slice capacity with estimated counts (`strings.Count` of braces and pounds) prevents slice expansion. Finally, utilizing stack-allocated buffers `[8]optionSig` for options signature processing avoids heap allocation on small structures.
**Action:** Implemented `isSortedAndUnique` check in `uniqueStrings`/`SamePlaceholderSet`, pre-allocated capacity for `Placeholders` using `{` and `#` character counts, and integrated a stack-allocated buffer for plural options sorting in `internal/i18n/icuparser/invariant.go`. This achieved ~3x fewer allocations and reduced bytes allocated from 1136 to 1072.

## 2027-05-10 - Optimizing SHA-512 hashing and fingerprints via hex.EncodeToString
**Learning:** In Go, formatting hex-encoded digests (such as SHA-512 hashes or checkpoints) using `fmt.Sprintf("%x", ...)` is highly expensive because it relies on runtime reflection, format-string parsing, and dynamic allocations. Replacing it with `hex.EncodeToString` from the standard `encoding/hex` library completely bypasses reflection, dramatically reducing allocations and memory overhead in high-frequency operations.
**Action:** Replaced `fmt.Sprintf("%x", ...)` with `hex.EncodeToString` inside hot hashing functions like `hashSourceText`, `lockStoredFingerprint`, `lockFingerprintEqual`, and `imageSourceFingerprint` to achieve a ~28.2% reduction in planning time and save over 20,000 allocations per large planning operation.

## 2027-05-15 - Plain text fast-path in ICU parser
**Learning:** In high-volume translation engines, the vast majority (60-90%) of strings are plain text containing no ICU special syntax (such as braces `{`, tags `<`, quotes `'`, or plural markers `#`). Running full recursive parsing loops and pre-allocating slice capacities for these simple strings generates substantial garbage collection pressure and CPU overhead. A dual-guard fast-path checking for these characters immediately returns a single sliced `LiteralElement`, bypassing the parser loop entirely.
**Action:** Always consider plain text fast-paths for sequential and structural template parsers when literal strings dominate the expected input corpus.

## 2027-05-20 - Optimizing JS/TS Locale Module Parser via Static Stop Characters, SIMD Skipping, and ASCII Fast-Paths
**Learning:** For language-specific module parsers (like JS/TS) that scan heavy code blocks: 1) repeatedly constructing and concatenating `stopChars` for string literals in hot loops creates substantial garbage collection pressure; 2) character-by-character loops inside parser token skippers (like `skipJSTSStringLiteral`) can be replaced with SIMD-accelerated library functions like `strings.IndexAny`; 3) scanning loops that process standard whitespace or alphanumeric identifiers can employ ASCII byte-level fast-paths to completely bypass expensive UTF-8 decoding (`utf8.DecodeRuneInString`) and standard library Unicode lookups; 4) heavy sub-parsers (like `skipJSTSIgnoredToken`) called sequentially at every position should be short-circuited by pre-screening the current character first to eliminate thousands of redundant function calls.
**Action:** Use precomputed package-level static constants for delimiter stop sets, utilize SIMD-accelerated functions where possible, implement ASCII-first checks in character scanning loops, and gate nested helper skippers behind character pre-screening.

## 2027-05-18 - Optimizing Fluent Parser with capacity hints and zero-allocation indents
**Learning:** For Mozilla Fluent FTML localization files, sequential parsers benefit from capacity hints, but reserving one `fluentEntry` per physical line over-allocates on sparse or comment-heavy files because blank, comment, and continuation lines never become entries. Prefer `len(lines)/2` for the entries slice. Pre-allocating `strings.Builder` via `Grow` and early-returning empty comment arrays prevents helper builder allocations on the hot path. Manual fast paths for common indent widths (0-width and 4-space) in continuation indent helpers avoid string concatenations and allocations.
**Action:** Keep entries capacity at `len(lines)/2`, add early returns to helper format builders, and bypass slice/string concatenations using manual indentation fast paths.

## 2027-05-25 - Pre-allocation of Aggregators and Reflectionless Sorting in Selection Catalog Building
**Learning:** When generating a localization task selection catalog from thousands of planned tasks, map resizing and slice sorting with reflection (i.e. `sort.Slice`) can consume substantial heap and CPU cycles. Pre-allocating top-level and inner maps with sensible capacity hints based on planned tasks avoids multiple rehashing and resizing steps. Replacing reflection-based `sort.Slice` with Go's generic `slices.SortFunc` completely avoids reflection. Furthermore, in `sortedValues`, we can completely bypass `slices.Sort` for empty or single-element sets to prevent redundant sorting overhead on inherently sorted data.
**Action:** Always pre-allocate top-level maps and inner maps/sets when a bound on total entries is known, employ `slices.SortFunc` with `cmp.Compare` instead of `sort.Slice` to avoid reflection, and skip calling sorting functions entirely for slices containing 1 or fewer elements.

## 2027-05-28 - Zero-allocation byte scanning for brace placeholder extraction in scoring evaluator
**Learning:** In scoring evaluators and text parsing pipelines, using standard regular expressions like `FindAllStringSubmatch` to extract simple brace-enclosed identifier tokens (e.g., `{name}`) creates unnecessary heap allocations for match/submatch slices and extracted string tokens. Replacing regex matching with a manual zero-allocation byte scanner (`scanBracePlaceholders`) that iterates over bytes using `strings.IndexByte` and passes direct string slices to a callback completely eliminates regex slice allocation overhead.
**Action:** Replace high-frequency regular expression token extraction with dedicated, zero-allocation byte scanners when token patterns have simple fixed delimiters and clear identifier syntax rules.

## 2027-06-02 - Iterative IndexAny regex scanning for placeholder extraction
**Learning:** `regexp.FindAllStringIndex` allocates a `[][]int` slice containing all match coordinate spans across the entire string at once. For strings containing regular expressions anchored by signal characters (like `%` and `$`), using `strings.IndexAny` to skip non-matching literal text and iterating with `FindStringIndex` incrementally avoids allocating the match-index array. Additionally, lazy initialization of the output slice avoids slice allocation when all potential signal matches are escaped (e.g. `%%`).
**Action:** Use `strings.IndexAny` + `FindStringIndex` loops for extracting regex-based tokens anchored by fixed signal characters to avoid `[][]int` allocation overhead.

## 2027-06-10 - Stack-allocated hex encoding and map key string slicing for segment keys
**Learning:** In document parsers that generate hashed segment keys (e.g. `htmlSegmentKey`, `liquidSegmentKey`, `markdownSegmentKey`), `hex.EncodeToString` allocates a new string on the heap for every segment. Using a stack buffer `var hexBuf [16]byte` with `hex.Encode(hexBuf[:], sum[:8])` avoids string allocation. Furthermore, Go's map lookup `m[string(hexBuf[:])]` is optimized by the compiler to perform zero allocations. Finally, when inserting a new entry into the occurrences map, slicing the newly generated key string (`key[prefixLen:]`) reuses the underlying string buffer instead of allocating a separate string for the map key.
**Action:** Use stack-allocated byte buffers for fixed-size hex digests, rely on Go's `m[string(byteSlice)]` compiler optimization for map reads, and store string slices of newly constructed strings as map keys to minimize heap allocations.

## 2027-06-15 - Fast-path ASCII byte scanning and map pre-allocation in GNU Gettext PO parser
**Learning:** In GNU Gettext PO file parsing and marshalling, `strconv.IsPrint` and `utf8.ValidString` perform full UTF-8 rune decoding for every string value being written. A single-pass ASCII byte scanner bypasses rune decoding and unicode table checks for standard printable text. Additionally, pre-allocating the results map capacity using template file size hints and eliminating redundant `strings.TrimPrefix` / `strings.TrimSpace` operations reduces allocations by ~48% and improves parsing and marshalling speeds by ~17%.
**Action:** Use byte-level ASCII fast-paths for string escaping/quoting checks and pre-allocate result maps based on content size hints in translation file parsers.

## 2027-06-20 - Single-Line Fast Paths and Single-Pass Line Scanning in Prompt Context Sanitization
**Learning:** Functions that clean and truncate multiline prompt contexts (like `sanitizePromptContext`) often perform multiple allocation passes (`ReplaceAll`, `Split`, `TrimSpace`, `Join`, `[]rune`). A fast path for single-line inputs without newlines (`!strings.ContainsAny(value, "\r\n")`) achieves 0 heap allocations. For multiline strings, single-pass line boundary scanning with a pre-allocated `strings.Builder` and byte/rune decoding (`utf8.DecodeRuneInString`) for truncation avoids all intermediate slice allocations.
**Action:** Use single-line fast-paths and single-pass `strings.Builder` line boundary scanning for prompt and context sanitization functions.

## 2027-06-25 - Map/Slice Pre-allocation and Pre-screening for JSONC Comment Extraction
**Learning:** In comment extraction pipelines for translation files (like `parseJSONCKeyComments`), maps (`contexts` and `contextByKey`) and slices (`stack` and `pendingComments`) starting with 0 capacity cause repeated heap allocations and dynamic map rehashing as keys and comments are processed. Pre-allocating `contexts` map capacity using `bytes.Count(content, []byte{':'})` and pre-allocating slice headers eliminates dynamic map expansion and slice re-allocations. Furthermore, guarding character-by-character comment scanners (like `indexJSONCLineComment`) behind a cheap `bytes.IndexByte(line, '/') >= 0` check avoids calling line comment scanners on lines without slashes.
**Action:** Estimate map capacities using key delimiter counts (such as colons) and pre-screen lines with `IndexByte` before invoking detailed character scanning helpers.

## 2027-06-30 - Pre-screening payload markers and unsafe string slice hashing in task planning
**Learning:** In high-volume task planning pipelines, calling heavy object deserialization like `json.Unmarshal` into `map[string]any` to detect specific JSON schemas (such as FormatJS) creates thousands of unnecessary heap allocations when processing standard JSON files. Pre-screening the byte content for key string markers (`bytes.Contains(content, []byte("defaultMessage"))`) before unmarshalling avoids schema checks for standard JSON files. Additionally, using `unsafe.Slice(unsafe.StringData(s), len(s))` when passing string data to standard hashing functions like `sha512.Sum512` avoids slice-copy heap allocations.
**Action:** Pre-screen raw byte inputs for characteristic schema keywords before unmarshalling into reflection-heavy maps, and use zero-allocation string slice views when passing read-only strings to byte-based hasher functions.

## 2027-07-05 - Pre-screening subtitle line markers and reflectionless cue key generation
**Learning:** In subtitle file parsing (.srt and .vtt), non-timestamp lines (cue IDs, text payloads, blank lines) comprise ~75% of lines. Pre-screening candidate lines with `strings.Contains(line, "-->")` before invoking `strings.TrimSpace` and regex timestamp pattern matching bypasses expensive regex execution on non-timestamp lines. Furthermore, single-line text payloads can bypass `strings.Builder` allocations entirely, and cue key generation can replace `fmt.Sprintf` reflection with string concatenation and `strconv.Itoa`.
**Action:** Pre-screen lines with delimiter signals before running regex timestamp matchers, fast-path single-line text payloads, and avoid `fmt.Sprintf` in sequential cue key formatting.

## 2027-07-10 - Exact Delimiter-Based Capacity Hinting and String Replacer Bypass in PHP Array Parsing
**Learning:** In static array translation file parsers (like PHP arrays returning key-value maps), estimating capacity with `bytes.Count(content, []byte("=>"))` provides exact bounds for entries slices and deduplication maps, completely eliminating map rehashing and slice re-allocations. Furthermore, static package-level constants for quote stop sets (`phpSingleQuoteStopChars`) eliminate dynamic string allocations in parsing loops. Finally, adding a `!strings.ContainsAny(value, ...)` fast-path to literal string serializers bypasses `strings.Replacer.WriteString` trie scanning for standard plain-text translations.
**Action:** Use `bytes.Count` with key-value delimiter tokens for exact capacity hints, replace quote stop set concatenations with package constants, and guard `strings.Replacer` calls behind `ContainsAny` fast-paths.
