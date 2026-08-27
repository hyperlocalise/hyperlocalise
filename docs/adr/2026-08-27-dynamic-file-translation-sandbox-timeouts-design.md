# Dynamic File Translation Sandbox Timeouts

## Context

File translation sandboxes currently have a fixed ten-minute lifetime. Large jobs can exceed that lifetime, while an individual workflow step can wait indefinitely for a detached sandbox command. Workflow retries can then leave the job running for much longer than the sandbox lifetime.

## Design

Use one sandbox for each file translation job. Create it with the existing ten-minute minimum so source upload and entry extraction can run. After extracting the source entries and loading project and translation-memory prefills, calculate the remaining translation workload. For each target locale, count source keys that are absent from the merged prefill set, then sum those locale-specific counts. This is equivalent to subtracting completed translations while also accounting for translation-memory matches, hidden-key prefills, and non-repository uploads.

Budget three seconds for each key-locale translation and add a fixed setup and cleanup allowance. Increase the running sandbox's total timeout to the larger of the existing ten-minute minimum or the calculated budget plus the allowance.

Run at most 100 translations per CLI invocation. After each invocation, preserve the current lockfile-based resume behavior and persist any readable translations. Later invocations omit `--force`, allowing the CLI to skip completed work.

Preserve the previous 500,000-translation pagination capacity by allowing at least 5,000 pages of 100 translations. When the known pending workload is larger, derive the page ceiling from `ceil(pending translations / 100)`. Use the same ceiling for the initial pass, per-locale recovery, and glossary retry loops.

Bound each detached translation command below the five-minute workflow function limit. When the command exceeds that deadline, kill it inside the sandbox and return a stable `sandbox_timeout` failure. This gives the workflow time to record a failed job and stop the sandbox instead of relying on infrastructure termination.

## Error Handling

Map `sandbox_timeout` to a specific temporary-failure message. Do not promise that progress was saved because a timed-out command can exit before readable output is persisted, and non-repository uploads have no reusable persistence path. Do not classify the timeout as a transport disconnect or recreate the sandbox automatically. The normal workflow failure path records the failure and runs best-effort cleanup.

## Testing

Add tests for workload-based timeout calculation, sandbox timeout updates, command timeout propagation, and user-facing timeout mapping. Run the web test and check commands required by the repository instructions.
