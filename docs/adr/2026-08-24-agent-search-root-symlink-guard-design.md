# Agent search-root symlink guard

## Summary

The agent workspace `grep` and `glob` tools must reject any search path whose root or parent is a symbolic link. This rule applies even when the link resolves inside the workspace.

Ripgrep's `--no-follow` option protects descendant traversal, but ripgrep still follows a symbolic link supplied as its command-line search root. The current tools also execute searches directly instead of passing each result through the guarded `readFile` path. A repository symlink can therefore expose files outside the repository.

## Design

Add one shared search executor for the `rg`, `grep`, and `find` calls used by `grep` and `glob`. The executor receives a normalized, workspace-relative search root and runs two operations in one shell process:

1. Check each component of the search root with a non-following symbolic-link test.
2. Execute the requested search command only when every component passes.

Keeping the check and command in one shell invocation avoids returning to application code between validation and search. The read-only workspace policy prevents repository changes while the command runs. Command names and arguments remain separate positional parameters; user input never becomes shell source.

For a path containing glob metacharacters, validate the literal directory prefix before the first globbed segment. Ripgrep searches from the workspace root in this case, and `--no-follow` prevents traversal through matching descendant links.

Add `--no-follow` to glob's ripgrep file listing. Keep the fallback `find` search non-following and execute it through the same root guard.

## Failure handling

The shared executor returns a distinct unsafe-root result when it finds a symlink component. `grep` and `glob` map that result to a stable tool failure and return no matches or files. They must not fall back to another search command after a guard failure.

Missing ordinary paths retain their current search semantics. Lexically invalid paths, including absolute paths and parent traversal, remain blocked by `normalizeWorkspacePath`.

## Tests

Add regression tests with real in-memory filesystem symlinks. Cover direct search-root symlinks and symlinked parent directories, with targets both inside and outside the workspace. Assert that:

- `grep` returns no match bodies from the target;
- `glob` returns no target filenames;
- neither tool invokes an unguarded fallback after rejection;
- normal, bracketed Next.js, and globbed paths still work; and
- glob's ripgrep invocation includes `--no-follow`.

Run the focused workspace tool tests, then the required `vp test` and `vp check --fix` commands from `apps/hyperlocalise-web`.

## Alternatives considered

A new workspace-runtime validation method would place the check behind a cleaner interface, but it would expand several runtime and test contracts for this narrow fix. Reading every discovered file through `readFile` would reuse its existing guard, but it would reimplement grep in application code and make repository searches much slower.
