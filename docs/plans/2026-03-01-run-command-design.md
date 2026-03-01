# hyperlocalise run: Design

Date: 2026-03-01
Status: Approved for planning
Owner: CLI/i18n

## Goal

Add `hyperlocalise run` to execute local translation generation from configured source files into target files.

Command scope:
- Supports one flag: `--dry-run`
- Uses `i18n.jsonc` config loading and validation
- Plans entry-level translation tasks
- Skips tasks already recorded in lock state
- Prints planned work
- Executes remaining tasks in parallel (CPU core count)
- Records successful task completion in lock state

## Non-goals

- No new command flags beyond `--dry-run`
- No UI changes beyond text/json command output conventions already used in repo
- No cross-process lock coordination in this iteration

## User-visible behavior

`hyperlocalise run` flow:
1. Load and validate `i18n.jsonc`.
2. Map translation work at entry level.
3. Load lock state and skip completed entries.
4. Print plan summary and task list.
5. If `--dry-run` is set, stop with exit code `0`.
6. Otherwise execute with worker count `runtime.NumCPU()`.
7. As each task succeeds, persist completion to lock state.
8. Continue on per-task failures and return non-zero if any task failed.

## Architecture

## Command layer (`cmd/run.go`)

Thin orchestration only:
- Parse `--config` and `--dry-run`
- Build runtime dependencies
- Call `runsvc.Run(ctx, input)`
- Print report and choose exit status

Registration:
- Add `newRunCmd()` to `cmd/root.go`

## Service layer (`internal/i18n/runsvc`)

Owns the end-to-end flow and testable business logic.

Primary entrypoint:
- `Run(ctx context.Context, in Input) (Report, error)`

Internal phases:
1. `loadConfig`
2. `planTasks`
3. `applyLockFilter`
4. `executePool`
5. `flushOutputs`
6. `finalizeReport`

## Data model

`Task` (entry-level unit):
- `SourceLocale`
- `TargetLocale`
- `SourcePath`
- `TargetPath`
- `EntryKey`
- `SourceText`
- `ProfileName`
- `Provider`
- `Model`
- `Prompt`

`Report`:
- `PlannedTotal`
- `SkippedByLock`
- `ExecutableTotal`
- `Succeeded`
- `Failed`
- `PersistedToLock`
- `Failures[]` (`targetPath`, `entryKey`, `reason`)

## Planning rules

Configuration:
- Use existing `config.Load()` validation chain.
- Any config error stops immediately with explanation.

Profile resolution:
- Resolve from `llm.rules` by priority.
- Fallback to `llm.profiles.default`.
- If unresolved, fail planning.

Source file validation:
- Source files are validated during planning.
- If any mapped source file does not exist, planning fails and run stops.
- If source file format is unsupported or parse fails, planning fails and run stops.

Task mapping:
- Expand group/bucket/locale mapping into entry-level tasks.
- Lock identity key: `targetPath::entryKey`.

## Lock handling

Existing lock package is reused for load/save shape, with run-specific completion state extension.

Concurrency rule:
- Workers do not write lock files directly.
- A single lock-writer goroutine receives successful completion events over a channel.
- The lock-writer updates in-memory state and persists to disk.

Why:
- Avoid concurrent writes to one file.
- Keep lock updates ordered and deterministic within a process.

Failure behavior:
- If lock persistence fails, treat as fatal for run consistency and return error.

## Execution model

Worker pool:
- Size = `runtime.NumCPU()`
- Pulls from a shared jobs channel

Worker job steps:
1. Translate one entry using resolved provider/model/prompt.
2. Stage translated result in thread-safe in-memory output buckets keyed by target file.
3. Emit completion event to lock-writer on success.
4. Record failure event on error.

Queue policy:
- Continue-on-error for translation failures.
- Do not cancel all work on first task failure.

Write policy:
- After pool completion, flush staged output files atomically (temp + rename pattern).

## Error handling

Fail-fast errors (no execution starts):
- Invalid config
- Missing source file
- Unsupported source format / source parse failure
- Unresolvable profile
- Corrupt lock file (cannot decode)

Continue-on-error errors (execution phase):
- Per-entry translation failure
- Per-entry output staging conflict (if any)

Fatal-during-execution errors:
- Lock write failure in lock-writer goroutine

Exit codes:
- `0`: dry-run success, or full execution success
- non-zero: any execution failures or fatal run errors

## Output behavior

Text output includes:
- Planned total
- Skipped-by-lock total
- Executable total
- Succeeded, failed, persisted-to-lock totals
- Failure lines with `targetPath`, `entryKey`, and concise reason

`--dry-run` output:
- Prints plan and skipped entries
- Does not execute translation
- Does not write output files
- Does not mutate lock state

## Testing plan

`runsvc` unit tests:
- Invalid config stops before planning
- Missing source file fails planning
- Unsupported/invalid source file fails planning
- `llm.rules` resolution with default fallback
- Lock filtering by `targetPath::entryKey`
- Dry-run makes no writes
- Continue-on-error returns partial failure report
- Single lock-writer serializes lock updates
- Lock write failure surfaces as fatal error

`cmd` tests:
- `run` command registration and help text
- `--dry-run` flag behavior
- Exit status behavior on partial failures

## Trade-off notes

- A single lock-writer goroutine is simpler and safer than worker-direct file writes.
- We defer cross-process lock coordination to a later iteration to keep this release focused.
- Service extraction (`runsvc`) keeps CLI thin and enables focused testing.

## Rollout

1. Add command shell and service scaffolding.
2. Implement planning and dry-run path first.
3. Add execution pool + lock-writer.
4. Add atomic output flush and comprehensive tests.
5. Update README command list and usage section.
