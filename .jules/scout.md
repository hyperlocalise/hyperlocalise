# Scout's Journal

## 2025-05-14 - [Go Coverage Tooling Fallback]
**Learning:** In some environments, `make test` might fail if the `covdata` tool is missing from the Go installation, preventing workspace-wide coverage aggregation.
**Action:** Use `go test ./...` from the repository root as a reliable fallback to verify Go code logic when coverage tools are unavailable.

## 2025-05-14 - [ICU Invariant Parity]
**Learning:** Structural parity for ICU messages (verified via `SameICUBlocks`) should remain "loose" regarding the count of '#' symbols (`Pounds`) in plural branches. LLMs often perform valid linguistic rewrites (e.g., replacing `{count}` with `#` or vice-versa) that change the `Pounds` metadata but remain semantically correct. Tightening this check causes excessive false-positive validation failures.
**Action:** Use `SameICUBlocks` for high-level structure (Arg, Type, Selectors) and rely on separate checks (like `HasDuplicatePounds`) for safety, rather than enforcing identical metadata counts.
