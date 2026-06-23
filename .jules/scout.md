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

## 2025-06-12 - [PO msgid Significance of Whitespace]
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

## 2025-06-12 - [Structural Validation of Complex Identifiers]
**Learning:** ICU placeholders often use flattened JSON paths (dots and array indices). Validation must ensure structural integrity: a closing bracket `]` must either end the identifier or be immediately followed by a path separator (`.`) or another index (`[`). Failing to enforce this allows malformed strings like `{items[0]suffix}` to be collected as valid placeholders.
**Action:** When testing identifier validation, include "tail" cases where valid segments are followed by invalid characters to ensure the state machine or regex correctly terminates or rejects the input.

## 2025-06-18 - [ICU Plural Negative Selectors]
**Learning:** ICU plural exact-value selectors (e.g., `=-1`) can include negative numbers. A naive selector parser that only expects digits after the `=` prefix will fail on these valid selectors. Additionally, when parsing sequences that require at least one element (like digits after a sign), using an explicit starting position marker (`digitStart`) to verify consumption is clearer and more robust than checking the last character's properties.
**Action:** Ensure plural selector parsing explicitly handles an optional minus sign following the `=` prefix before consuming digits, and use explicit position markers to validate that at least one digit was consumed.

## 2025-06-19 - [Flexible Whitespace in Self-Closing Tags]
**Learning:** ICU and HTML-style tag parsers must handle flexible whitespace in self-closing tags (e.g., `<br / >`). Standard XML is strict about `/>`, but real-world localization strings often contain these variations. Failing to support them leads to "unclosed tag" errors during parsing.
**Action:** Always allow whitespace after the slash in self-closing tag detection to improve compatibility with common HTML formatting.

## 2025-06-25 - [Path Resolution with Empty Tokens]
**Learning:** Path resolution patterns using tokens like {{localeDir}} can produce leading slashes if the token is at the start of the pattern and resolves to an empty string (e.g., when source and target locales match). These leading slashes can cause downstream safety checks that expect strictly relative paths to fail.
**Action:** Always apply repository-relative path normalization after token substitution and before safety validation to ensure consistent handling of relative paths regardless of token resolution.

## 2025-06-25 - [Slash Collapsing in Path Resolution]
**Learning:** `normalizeRepositoryRelativePath` may only handle leading/trailing slashes and specific segments (like `.` or `..`). It might not collapse internal multiple slashes (e.g., `a//b`).
**Action:** When performing token substitution that might result in empty segments, explicitly collapse multiple slashes using a regex (e.g., `path.replace(/\/+/g, "/")`) before applying repository-wide normalization.

## 2026-07-02 - [Mixed XML Encoder and Buffer Writes]
**Learning:** Interleaving `xml.Encoder.EncodeToken` calls with direct writes to the encoder's underlying `bytes.Buffer` causes content reordering because `xml.Encoder` is buffered. Tokens sent to the encoder are held until a flush, while direct buffer writes happen immediately.
**Action:** Always call `enc.Flush()` before writing directly to the underlying buffer (e.g., when decoding `CharData` tokens into literal text) to maintain correct element order.

## 2026-07-03 - [Heuristic Tag Identification for Parity]
**Learning:** HTML tag parity checks must balance protecting application-specific markup (like MDX or Web Components) with allowing legitimate removal of template-style placeholders (like `<resource_id>` or `<v1>`). Aggressively treating any tag containing dots, underscores, or digits as structural markup causes false-positive mismatches when translators omit these tokens. Strong indicators of "true" markup include hyphens, colons, PascalCase (MDX), or the presence of attributes.
**Action:** Use heuristics to distinguish markup from placeholders: treat tags as markup if they are known atoms (excluding generic placeholders like `name` and `id`), contain hyphens/colons, start with an uppercase letter, or have attributes. Avoid treating plain attribute-less tokens with dots, underscores, or digits as structural markup by default.

## 2026-07-10 - [Robust Markdown Link Title Parentheses Handling]
**Learning:** Naive depth-counting scanners for Markdown link destinations (e.g., `[](/url "title")`) fail when parentheses appear inside quoted titles (e.g., `[link](/url "title )")`). The scanner prematurely terminates the destination segment at the first unquoted closing parenthesis, leading to corrupted metadata and broken round-trips.
**Action:** Always implement quote-aware scanning for link destinations and titles. Parentheses encountered while inside a single or double-quoted literal must be ignored by depth counters to ensure the full span of the link is correctly identified and protected.

## 2025-07-15 - [ICU Parser Error Robustness]
**Learning:** ICU parsers should provide clear error messages for common syntax mistakes like unclosed braces, mismatched tags, or missing options. While leniency is good for some things (like unclosed quotes), structural errors should be caught to prevent malformed ASTs that could lead to incorrect translations or application crashes.
**Action:** Include comprehensive error-case tests for the parser to ensure it correctly identifies and reports syntax errors in ICU messages and HTML tags.

## 2025-07-20 - [ICU Element Type and Nesting Validation]
**Learning:** ICU `PluralElement` can represent both `plural` and `selectordinal` types. Structural parity checks rely on the `Type()` method, which correctly chooses the type based on the `Ordinal` flag or an explicit override. Additionally, pound signs (`#`) must be identified as `PoundElement` even when nested inside non-plural blocks (like `select`) if they are ultimately contained by a `plural` or `selectordinal` block.
**Action:** Always test the `Type()` method for all AST elements, especially for polymorphic elements like `PluralElement`. Ensure nesting tests cover cases where markers like `#` are separated from their parent block by other types of ICU blocks.

## 2026-06-23 - [Translator Request Validation Safety]
**Learning:** Shared request types in the translator package (Request, ImageEditRequest) lack explicit validation tests, despite being critical internal APIs. Adding dedicated tests for their validation logic ensures that contract requirements (like mandatory fields or supported image formats) are consistently enforced across all provider implementations.
**Action:** Always include comprehensive success and failure test cases for validation helpers when introducing or modifying shared data structures to prevent regressions in API contract enforcement.
