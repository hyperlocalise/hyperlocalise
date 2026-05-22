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
