# Scout's Journal

## 2025-05-14 - [Go Coverage Tooling Fallback]
**Learning:** In some environments, `make test` might fail if the `covdata` tool is missing from the Go installation, preventing workspace-wide coverage aggregation.
**Action:** Use `go test ./...` from the repository root as a reliable fallback to verify Go code logic when coverage tools are unavailable.

## 2025-05-14 - [ICU Invariant Parity]
**Learning:** Structural parity for ICU messages (verified via `SameICUBlocks`) should remain "loose" regarding the count of '#' symbols (`Pounds`) in plural branches. LLMs often perform valid linguistic rewrites (e.g., replacing `{count}` with `#` or vice-versa) that change the `Pounds` metadata but remain semantically correct. Tightening this check causes excessive false-positive validation failures.
**Action:** Use `SameICUBlocks` for high-level structure (Arg, Type, Selectors) and rely on separate checks (like `HasDuplicatePounds`) for safety, rather than enforcing identical metadata counts.

## 2025-05-15 - [ICU Nested Plural Pound Scoping]
**Learning:** In ICU message syntax, the `#` symbol refers only to the argument of the *nearest* enclosing plural block. If plurals are nested, `#` inside the inner block does not refer to the outer plural's argument. Analyzing message invariants (e.g., counting pound usages) must respect this scoping by stopping recursion at nested plural boundaries.
**Action:** When traversing ICU AST for pound counting or validation, treat `PluralElement` as a scoping boundary; recurse into its branches for its own analysis, but exclude its children when calculating metrics for a parent plural.

## 2025-05-15 - [ICU Select Argument Parity]
**Learning:** `SelectElement` arguments were missing from the extracted `Placeholders` list in `Invariant` metadata, despite being structural arguments like `PluralElement` arguments. This inconsistency can lead to incomplete placeholder validation in downstream tools.
**Action:** Ensure all ICU argument-bearing elements (`Argument`, `Number`, `Date`, `Time`, `Plural`, `Select`) call `appendPlaceholder` during invariant collection.

## 2025-05-22 - [Unicode Placeholder Support]
**Learning:** ICU and mustache-style placeholders were restricted to ASCII letters, causing validation failures for non-Latin scripts or mathematical symbols (e.g., {π}).
**Action:** Use `unicode.IsLetter` in placeholder validation helpers to ensure broad script support while maintaining structural integrity.

## 2025-05-23 - [PO Parser Multiline State Management]
**Learning:** The PO file parser's state management using `activeField` can lead to data leakage if not explicitly reset when encountering ignored fields (like `msgid_plural` or non-zero `msgstr[N]`). Continuation lines (quoted strings on new lines) rely on `activeField` to determine which buffer to append to; if `activeField` remains set to a previous valid field (e.g., `msgid`), the continuation from an ignored field will be incorrectly appended to it.
**Action:** Always reset `activeField` to an empty string when skipping fields that may have multiline continuations to ensure subsequent lines are correctly ignored.

## 2025-05-24 - [Auth Redirect Sanitization Bypasses]
**Learning:** URL sanitization for redirect parameters (e.g., `returnTo`) can be bypassed using URL-encoded characters (e.g., `%73` for `s`) or mixed casing if the validation check is performed on the raw string. This is particularly dangerous for preventing loops to sensitive authentication routes.
**Action:** Always decode URI components and normalize the path to lowercase before comparing against restricted route lists. Perform validation on the normalized path while preserving the original string for the final redirect to maintain routing integrity.

## 2025-05-28 - [Cross-platform Path Testing]
**Learning:** Hardcoded absolute Unix paths (e.g., /tmp/root) in tests are not portable and will fail on non-Unix environments like Windows. Security-sensitive path guarding logic often involves complex interactions with symlinks and canonicalization.
**Action:** Use t.TempDir() and filepath.Join to construct portable paths for testing. When testing symlink-aware logic, evaluate symlinks on the base temporary directory to ensure consistent behavior across environments where the temporary directory itself might be a symlink (e.g., /var -> /private/var on macOS).

## 2025-05-30 - [Robust Glossary Boundary Matching]
**Learning:** Standard regex word boundaries (`\b`) fail for glossary terms that start or end with non-word characters (e.g., "C#", ".NET", "Go!"). `\b` requires a transition between a word character (`\w`) and a non-word character or string boundary. If a term like "C#" is followed by a space, there is no `\b` after the "#" because both "#" and " " are non-word characters.
**Action:** Use negative lookarounds `(?<![a-zA-Z0-9_])` and `(?![a-zA-Z0-9_])` to implement "word boundaries" that correctly handle terms containing symbols while still preventing partial matches within larger alphanumeric words.

## 2025-06-05 - [Typed ICU Block Invariants]
**Learning:** ICU elements for `number`, `date`, and `time` were previously excluded from `ICUBlocks` metadata, which is used for structural parity checks. While their arguments were extracted as placeholders, their specific types were missing from the structural signature. This could allow a translation to change the type (e.g., from `date` to `number`) without triggering a structural mismatch.
**Action:** Ensure all "typed" ICU elements (`NumberElement`, `DateElement`, `TimeElement`) are appended to `ICUBlocks` during invariant collection to protect the structural integrity of complex messages.

## 2026-06-12 - [PO msgid Significance of Whitespace]
**Learning:** In gettext/PO files, `msgid` keys are the source of truth for translation lookups, and leading/trailing whitespace is significant. Over-eagerly trimming spaces from these keys during parsing causes lookup failures in downstream systems.
**Action:** Always preserve the exact literal string for `msgid` keys, except for the header entry (`msgid ""`) which is standardly skipped in message maps.

## 2026-06-03 - [Triple Mustache Placeholder Normalization]
**Learning:** `ParseInvariant` uses a `normalizeMustachePlaceholders` fallback to handle non-ICU formats. Many mustache-based systems use triple braces `{{{key}}}` for unescaped content. Failing to account for this leads to validation errors when these keys are used in translations.
**Action:** Update `normalizeMustachePlaceholders` to detect and strip both double and triple braces, converting them to standard ICU `{key}` format for invariant extraction.

## 2026-06-03 - [Robust ICU Tag Parsing with Attributes]
**Learning:** ICU parsers that support HTML-style tags must correctly handle attributes and namespaced tags (e.g., `<ui:button>`). Naive tag detection that stops at the first `>` can fail if that character appears inside a quoted attribute value (e.g., `<div attr=">">`). Misidentifying tag boundaries leads to incorrect structural analysis and false-positive placeholder/pound-sign detections.
**Action:** Implement attribute skipping in tag parsers that explicitly handles both single and double-quoted literals. Ensure the parser remains strict about tag closing to prevent malformed tags from silently being treated as literal text.

## 2026-06-12 - [Robust HTML Tag Parity with Quoted Attributes]
**Learning:** Standard regex-based tag extraction (e.g., `</?[A-Za-z][^>]*?>`) is insufficient for HTML tag parity checks when attributes contain `>` or tag-like content (e.g., `<div title="a > b">`). The regex prematurely terminates at the first `>`, leading to incorrect tag sequences and false-positive mismatches.
**Action:** Use a scanner-based approach for tag extraction that respects single and double quotes within tags. Ensure the scanner correctly identifies the full span of a tag before normalization and comparison.

## 2025-07-15 - [ICU Parser Error Robustness]
**Learning:** ICU parsers should provide clear error messages for common syntax mistakes like unclosed braces, mismatched tags, or missing options. While leniency is good for some things (like unclosed quotes), structural errors should be caught to prevent malformed ASTs that could lead to incorrect translations or application crashes.
**Action:** Include comprehensive error-case tests for the parser to ensure it correctly identifies and reports syntax errors in ICU messages and HTML tags.

## 2025-07-20 - [ICU Element Type and Nesting Validation]
**Learning:** ICU `PluralElement` can represent both `plural` and `selectordinal` types. Structural parity checks rely on the `Type()` method, which correctly chooses the type based on the `Ordinal` flag or an explicit override. Additionally, pound signs (`#`) must be identified as `PoundElement` even when nested inside non-plural blocks (like `select`) if they are ultimately contained by a `plural` or `selectordinal` block.
**Action:** Always test the `Type()` method for all AST elements, especially for polymorphic elements like `PluralElement`. Ensure nesting tests cover cases where markers like `#` are separated from their parent block by other types of ICU blocks.

## 2026-06-23 - [Translator Request Validation Safety]
**Learning:** Shared request types in the translator package (Request, ImageEditRequest) lack explicit validation tests, despite being critical internal APIs. Adding dedicated tests for their validation logic ensures that contract requirements (like mandatory fields or supported image formats) are consistently enforced across all provider implementations.
**Action:** Always include comprehensive success and failure test cases for validation helpers when introducing or modifying shared data structures to prevent regressions in API contract enforcement.

## 2026-06-24 - [CSV Injection: Escaping Line Feeds]
**Learning:** Security best practices (OWASP) for CSV injection/Formula injection require escaping not just '=', '+', '-', and '@', but also whitespace characters like Tab (0x09), Carriage Return (0x0D), and Line Feed (0x0A). If these characters appear at the start of a cell, some spreadsheet software may interpret the following content as a formula.
**Action:** Always include '\n' (Line Feed) in the set of characters that trigger formula escaping (prepending a single quote) in CSV cell values.

## 2026-06-26 - [ICU Pound Summation in Sibling Blocks]
**Learning:** In ICU message invariant analysis, pound signs (#) within sibling conditional blocks (like multiple 'select' blocks inside a single 'plural' branch) must be summed to correctly identify the maximum possible pound usage. While 'select' branches are mutually exclusive within a single block, sibling blocks are independent and both will contribute their respective 'active' branch content to the final message.
**Action:** When calculating pound invariants for a plural block, ensure that sibling elements correctly accumulate their counts, while only mutually exclusive branches (like those within a single 'select' or 'plural') take the maximum.

## 2025-07-25 - [Strict ICU Identifier Dot Validation]
**Learning:** ICU placeholder names that support property paths (dots) must not allow leading, trailing, or consecutive dots (e.g., `.name`, `name.`, `name..last`). Additionally, dots should not immediately precede an array index bracket (e.g., `items.[0]`). Failing to enforce these constraints can lead to malformed identifiers being collected during invariant analysis.
**Action:** When validating identifiers with dots, ensure each dot is followed by a valid subsequent character that is not another dot or an opening bracket.

## 2025-08-01 - [Preserving Path Relativity with Empty Tokens]
**Learning:** Path-resolution patterns starting with tokens (e.g., `{{localeDir}}/index.mdx`) can become absolute (e.g., `/index.mdx`) if the token resolves to an empty string. This causes "path escapes root" errors in security-sensitive CLI operations that expect relative paths.
**Action:** When resolving paths, only trim leading slashes if the original pattern was relative. Use `strings.TrimPrefix(path, "/")` conditionally based on the original pattern's prefix to preserve both absolute paths and intended relativity.

## 2025-08-05 - [ICU Invariant Styles]
**Learning:** ICU invariant analysis must capture styles for typed elements (number, date, time) in the BlockSignature Options field. This ensures that changes to the formatting style are detected as invariant mismatches, which is critical for maintaining consistency between source and translations.
**Action:** Always include the Style field from NumberElement, DateElement, and TimeElement in the ICUBlocks signature when collecting message invariants.

## 2026-08-12 - [Newline Parity and CRLF Literal Width]
**Learning:** Localization validation must protect leading/trailing newlines (`\n`, `\r`) as they often affect UI layout. Naive whitespace definitions that only include space and tab skip these critical characters. Additionally, escaped special character scanners must correctly track the width of multibackslash sequences (e.g., `\r\n` is 4 bytes: `\`, `r`, `\`, `n`) to avoid index misalignment during extraction.
**Action:** Include `\r` and `\n` in edge whitespace parity checks. Ensure special character literal width matches the source representation (e.g., `width: 4` for `\r\n`) to maintain scanner integrity.

## 2025-08-15 - [PHP Hex Escape Robustness]
**Learning:** PHP's string parser is lenient with invalid hex escape sequences (e.g., `\x` followed by a non-hex character), treating them as literal text rather than fatal errors. Mirroring this behavior in translation formats prevents unnecessary extraction failures on valid PHP files that happen to contain these sequences.
**Action:** When parsing escaped sequences in format-specific parsers, prefer falling back to literal text for malformed or incomplete escapes if that matches the source language's runtime behavior.

## 2025-05-23 - [PO Parser Comment State Reset]
**Learning:** Comments in PO files must reset the `activeField` state, just like ignored fields. If a comment is followed by a continuation line (a quoted string), the continuation would otherwise be incorrectly appended to the last active field (e.g. `msgid` or `msgstr`), leading to data corruption.
**Action:** Ensure comment line handlers explicitly reset `activeField` to prevent trailing continuations from leaking into preceding entries.

## 2026-07-10 - [Go Regex Word Boundaries with Non-word Characters]
**Learning:** In Go's `regexp` engine (RE2), the word boundary anchor `\b` matches the boundary between a word character (`[a-zA-Z0-9_]`) and a non-word character (or vice versa). If a placeholder ends with a non-word character like `@` (as in Objective-C's `%@`), a trailing `\b` will only match if the *following* character is a word character. It will fail if followed by space, punctuation, or end-of-string.
**Action:** When matching placeholders that end with symbols, avoid naive `\b` anchors. Instead, match the specific symbol literally or use negative lookaheads (if available/needed) to ensure correct detection across all contexts.

## 2025-07-15 - [Broadening Format Detection]
**Learning:** `KindForSourcePath` determines which validation rules (Markdown, HTML, ICU) apply to a segment. Previously, it only recognized a narrow set of extensions (e.g., `.md`, `.html`), causing common variations like `.markdown` or `.htm` to default to generic ICU validation, potentially missing format-specific structural checks.
**Action:** Ensure `KindForSourcePath` includes all common format variations (e.g., `.mdown`, `.mdwn`, `.htm`) in its extension-to-kind mapping to guarantee consistent validation across projects with different naming conventions.

## 2025-07-20 - [QA Mode and Profile Parity Interaction]
**Learning:** In `ValidateSegment`, QA checks (like `whitespace_only`) are executed after core format and profile parity checks. If a target string contains only whitespace while the source contains text, `validateWhitespaceProfile` will trigger a `format-whitespace-profile` failure (StatusFail) before the `qa-whitespace-only` warning (StatusWarn) is even evaluated.
**Action:** When testing QA modes via the top-level `ValidateSegment` entry point, ensure the source and target strings are chosen to either specifically trigger or specifically avoid overlapping profile parity violations to maintain test determinism.

## 2025-07-20 - [Comprehensive Printf Placeholder Detection]
**Learning:** Naive printf placeholder detection (e.g., matching only %s, %d) misses common specifiers like %i, %x, %u and modifiers like width (%02d), precision (%.2f), or length (%ld). This allows critical placeholders to be omitted from translations without triggering validation failures.
**Action:** Use a comprehensive regex that supports the full range of standard printf specifiers, flags, width, precision, and length modifiers to ensure structural parity is strictly enforced for all placeholder types.

## 2026-07-18 - [HTML Tag Name Extraction and Space Leniency]
**Learning:** The HTML tag name extraction helper (`extractTagName`) does not skip whitespace following a closing slash (e.g., `</ strong >` or `< / div>`). Instead, the scanning loop terminates at the space and returns `/`. Since `isLikelyMarkupTag` ignores `/`, such spaced structures are not recognized as markup.
**Action:** When unit testing tag parsing helper functions, match the precise behavior of the underlying parsing state-machine regarding spaces around structural markers like slashes.

## 2026-08-25 - [Testing Uncleaned and Relative Paths for Containment]
**Learning:** Testing path containment/directory traversal logic with pre-cleaned paths (e.g., using `filepath.Join` inside the test assertions) can mask issues. To properly verify containment defenses, test inputs must include raw uncleaned relative traversal strings (such as `path/../outside`) and relative paths (like `.` or `../`) to ensure the system handles dynamic resolving and absolute normalization correctly.
**Action:** When testing path guards or canonicalization logic, avoid pre-cleaning test candidates, and explicitly test both absolute and relative inputs across existence and non-existence boundaries.

## 2026-08-30 - [Strategy Parser Extension Resolution]
**Learning:** `Strategy.Parse` relies on Go's `filepath.Ext` to resolve custom registered extensions. Therefore, dynamically registered parser test cases must pass input filenames containing a dot (e.g. `file.custom` or `file.CUSTOM`) to ensure extension detection succeeds, rather than naked extensions like `custom`.
**Action:** Always construct realistic, dot-prefixed filenames (e.g. `"file." + strings.TrimPrefix(ext, ".")`) when verifying registered parser resolution in strategy-level unit tests.

## 2026-09-05 - [Apple Strings Parser Error Robustness]
**Learning:** Testing syntax parser error cases (such as missing '=' or ';', and unterminated strings/comments) directly on AppleStringsParser ensures high-value, deterministic error-handling coverage without relying on complex mocks or environment-dependent artifacts.
**Action:** Always include boundary syntax failure cases when writing or extending parsing behavior tests to guarantee robust input validation and user-friendly error messages.

## 2026-09-10 - [CSV Formula Injection Escaping Boundaries]
**Learning:** Formula injection defense in CSV exports must be selective. While cells starting with '=', '+', '-', or '@' are escaped to prevent arbitrary code execution, characters in the middle of a string (e.g. "1+1", "user@domain.com") or preceded by leading spaces (e.g. " =1+1") must NOT be escaped, as spreadsheet software does not interpret them as formula syntax and escaping them would corrupt legitimate translation values. Additionally, leading whitespace control characters like '\t', '\r', and '\n' must be escaped.
**Action:** Always include comprehensive edge-case tests verifying both injection character positioning and row boundary conditions (like nil or empty row slices) to protect CSV data-mapping/security filters.

## 2026-09-12 - [Go XML Syntax Error Precedence in Custom Parser Testing]
**Learning:** In custom token-based XML parsers utilizing Go's standard `xml.Decoder`, syntax errors (such as mismatched tags or unclosed structures) are returned immediately by `decoder.Token()`. This prevents the parser from executing subsequent custom EOF check logic. When testing validation and syntax errors, expect standard "XML syntax error" results for structurally malformed inputs, and save custom EOF/unterminated error assertions for cases where XML is syntactically valid but structurally incomplete according to the custom parser's rules.
**Action:** Ensure parser tests for malformed markup check for the underlying XML parser's syntax error rather than the custom parser's late-stage EOF checks if the tag structure violates the XML spec.

## 2026-10-15 - [I18N Config Locale Validation Edge Cases]
**Learning:** Testing config validation rules (like locales, targets, and fallbacks) with malformed JSON structure, empty values, spaces, and invalid regex characters (e.g. `?`) ensures that user configuration errors are caught immediately during validation rather than manifesting as silent errors during file lookup.
**Action:** Always include comprehensive, table-driven validation tests for core configuration files when adding or modifying validation rules.

## 2026-10-16 - [Japanese Script Validity Verification]
**Learning:** The localization evaluator's script validation helper (`localeValidityScore`) maps the Jpan script (e.g. for `ja-JP`) strictly to `unicode.Han` (Kanji). This means translations composed entirely of Hiragana (e.g., `"こんにちは"`) or Katakana (e.g., `"テレビ"`) will fail the script-compatibility check despite being valid Japanese, because they do not contain Han characters.
**Action:** When testing the `Jpan` script or `ja-JP` locales in evaluator unit tests, ensure the translation text includes at least one Kanji (Han) character (such as `"今日"`) to satisfy the validator's character-set requirements.

## 2026-10-18 - [Unicode Locale Normalization and Casing Fallback]
**Learning:** Checking or optimizing ASCII lowercase with custom fast paths (e.g. `isAlreadyLower`) must carefully handle non-ASCII characters by falling back to standard Unicode methods (`strings.ToLower`) to avoid corrupted normalization or incomplete deduplication across international scripts (e.g. Cyrillic, Greek, Arabic, Hebrew, and CJK).
**Action:** When working on locale-processing libraries, always add tests representing multiple non-ASCII language and script codes to guarantee Unicode safety and deterministic deduplication.

## 2026-10-25 - [Forbidden Term Score Edge Cases]
**Learning:** In the translation scoring evaluator, the `forbidden:term` tag-based filtering uses case-insensitive comparison, substring matching, and auto-trims whitespace. Empty tags like "forbidden:" or whitespace-only tags are safely ignored to avoid corrupting aggregate scores with false-positive penalties.
**Action:** When testing or extending evaluator filters, explicitly verify whitespace padding, case variations, substring/overlap matches, and malformed tags to protect translation safety constraints.

## 2026-11-05 - [YAML Pruning Validation and Sequence Stability]
**Learning:** When testing YAML pruning/round-tripping behavior using `MarshalYAMLWithPrune`, mapping nodes are selectively pruned according to prune keys, but sequence/array nodes are kept intact to prevent shift-index instability. Comprehensive testing must verify both the pruning of unwanted mapping leaf strings and the complete preservation of array elements and block/line comments.
**Action:** Use table-driven tests or multi-layered assertions that round-trip through both the marshaler and parser to ensure that template structures, comments, and array stable indices are verified end-to-end.

## 2026-11-10 - [API Base URL Security Validation Boundaries]
**Learning:** `ValidateAPIBaseURL` enforces strict security validations (preventing SSRF, open redirects, or credential leaks) by requiring public unicast IPs under HTTPS on production domains, while allowing localhost/loopback over HTTP or HTTPS. Testing this logic requires table-driven test cases covering URL query/fragments, user credentials, DNS trickery/suffix domains, bracketed IPv6 loopback structures, and RFC1918 private space IPs.
**Action:** When testing host, URL, or API endpoints, design comprehensive test matrices covering parsing anomalies (percent encoding errors), protocol/scheme requirements, and address routing properties (loopback vs public vs multicast/private unicast).

## 2026-11-15 - [I18N Config Hyperlocalise & Struct Validation Boundaries]
**Learning:** `I18NConfig` includes robust structural validation for map keys (buckets/groups), target locales, file mappings, and `HyperlocaliseConfig` credentials/API base URLs. Since `Load()` automatically overlays default values for empty string inputs before running `Validate()`, some validation constraints (like empty/whitespace `APIBaseURL` or `APIKeyEnv`) are unreachable via configuration file parsing.
**Action:** When testing configuration rules that can be overwritten by standard defaults, construct the `I18NConfig` struct manually in tests and run the public `.Validate()` method directly to comprehensively check contract enforcement.

## 2026-11-16 - [PHP Array Parser Syntax Error Boundaries]
**Learning:** PHPArrayParser syntax verification handles precise boundary error structures. Triggering "missing value" errors requires EOF to occur immediately following the array assignment operator (`=>`), whereas a following closing brace (`]`) yields an "unsupported value" error. Similarly, "unterminated array literal" errors trigger when the parser hits EOF during element loops, but expects a comma or close bracket at the current position.
**Action:** When validating PHP array literal parsing, assert on precise error substring expectations across varying trailing whitespace and closing punctuation bounds.

## 2026-11-17 - [Path Resolution and Token Collapsing Boundaries]
**Learning:** In path-resolution patterns using dynamic tokens (e.g., `{{localeDir}}/file.json`), when the source and target locales match, tokens like `{{localeDir}}` resolve to empty strings. This can lead to multiple consecutive forward slashes or change how absolute/relative path prefixes are detected. The path resolver collapses consecutive forward slashes but does not collapse consecutive backslashes (`\\`) on Windows-like path formats. Additionally, patterns starting with leading slashes are preserved as absolute paths, while relative patterns correctly remain relative by trimming any introduced leading slashes.
**Action:** When testing path resolution or file generation, always verify empty token edge cases, consecutive slash collapsing behaviors, and backslash/backslash preservation on absolute vs relative boundaries.

## 2026-11-18 - [File Workflow Error and Retry Mechanics Validation]
**Learning:** File workflow runner abstractions rely heavily on custom error classification (`IsCode` on wrapped/unwrapped `Error`) and backoff calculations (`retryDelay`). Directly testing these unexported/internal mechanisms in package-level unit tests guarantees configuration safety and prevents infinite spin-loops or panic-inducing divisions-by-zero, which can happen if positive bounds are not strictly enforced during normalization.
**Action:** When working on asynchronous task executors or API integrations with backoff/retry capability, always verify zero/negative configurations normalization and custom error unwrapping behavior directly in a targeted `_scout_test.go` suite.

## 2026-11-19 - [Generic XML Syntax and Validation Error Cases]
**Learning:** In token-based custom XML parsers utilizing Go's standard `xml.Decoder`, syntax errors (such as mismatched tags, unexpected closing tags, and unexpected EOF/unclosed elements) are caught and surfaced early by Go's standard parser. Custom validation errors (like duplicate key detection, keyed metadata conflict, mixed content, or stable key omission) require syntactically valid XML structure to be reached.
**Action:** When writing syntax error and edge-case unit tests for custom XML parsers, separate malformed/invalid XML layout test cases (and expect the underlying `xml.Decoder` syntax errors) from syntactically valid but structurally invalid custom error test cases (and assert precise custom error strings).

## 2026-11-20 - [CSV Parser and Marshaller Edge Cases]
**Learning:** `CSVParser` automatically resolves key/value columns using fallback names (like `key`, `id`, `value`, `target`, `source`), and falls back to any other available column if specified/preferred value columns are not found. Additionally, custom delimiters and lazy quoting can affect parsing error boundaries (such as treating rows with mismatched quotes as fewer fields).
**Action:** When validating CSV parser error boundaries, test fallback resolution mechanics, whitespace key exclusions, and ensure that empty templates generate correct structured headers deterministically.

## 2026-11-20 - [Translation Risk and Comparison Mechanics Verification]
**Learning:** Translation risk and comparison mechanics are vital safety boundaries in sync commands to alert users of translation length spikes (e.g. from LLM hallucinations) and structure/placeholder changes. Directly testing `detectRiskyChanges` with multi-byte Unicode strings (e.g., Japanese, Russian, French) ensures precise rune length calculation and correct floating-point ratio rounding boundaries, while validating `compareRiskChange` ordering ensures sorting of risk reports remains transitive and completely deterministic across locales, keys, contexts, and code groups.
**Action:** When testing sync, comparison, or diagnostic CLI workflows, always include robust, unicode-rich test vectors for risk evaluation and transitive checks on custom comparison helpers to prevent regressions in user-facing warning systems.

## 2026-11-21 - [Env Loader Edge Case Verification]
**Learning:** CLI environment loading functions can fail or behave unexpectedly if `.env` files are directories, contain syntax syntax errors (e.g. unclosed quotes), or contain complex values with equals signs and comments. Testing `LoadProjectFiles` with `t.TempDir()` and `os.Chdir` while safely unsetting environment variables ensures deterministic environment isolation without mutating host process environment variables.
**Action:** When testing environment file loaders or working-directory-dependent CLI utilities, isolate working directory changes with `t.Cleanup` and verify directory/syntax boundary error states.

## 2026-11-22 - [Spellcheck Markup Stripping and Word Tokenization Boundaries]
**Learning:** In localized spellchecking, `stripMarkup` and `scanWords` must handle HTML attributes containing angle brackets (e.g. `<a title="A > B">`), Markdown code spans with variable backtick fence lengths (where inner backticks only close if the fence length matches), ICU plural/select literals, and mid-word HTML entities (`Fran&ccedil;ais`, `don&rsquo;t`). Additionally, bare URLs trimmed of trailing sentence punctuation and UUIDs must be skipped without fragmenting into individual hex words.
**Action:** Always include complex mixed-markup test cases (combining HTML, Markdown links, ICU branches, entities, printf specifiers, and bare URLs) when verifying spellcheck tokenization to protect user-visible word extraction.
