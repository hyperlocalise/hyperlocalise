# Scout's Journal

## 2025-05-14 - [Go Coverage Tooling Fallback]
**Learning:** In some environments, `make test` might fail if the `covdata` tool is missing from the Go installation, preventing workspace-wide coverage aggregation.
**Action:** Use `go test ./...` from the repository root as a reliable fallback to verify Go code logic when coverage tools are unavailable.

## 2025-05-14 - [ICU Invariant Parity]
**Learning:** Structural parity for ICU messages (verified via `SameICUBlocks`) must include the count of '#' symbols (`Pounds`) in plural branches. Omitting this allows translations that technically match in argument and type but break when the numeric value is actually substituted.
**Action:** Always include deep structural metadata (like `Pounds`) when verifying localization invariants between source and target segments.
