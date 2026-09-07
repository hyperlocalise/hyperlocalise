# Record Job and Automation Activity Events

## Problem

Operators need a workspace-level record of job lifecycle changes and automation activity. The log
must identify whether a user, agent, API key, or system initiated the action without storing customer
content, provider messages, prompts, or agent transcripts.

## Design

Extend the activity-log contract with job and automation targets and six event types: job created,
cancelled, or failed; automation run started; and automation enabled or disabled.

Instrument the existing lifecycle boundaries instead of adding database triggers or refactoring all
job persistence behind a new service. Routes retain the authenticated user or API-key context, agent
job factories identify agent-created work, workflow completion services identify system failures, and
the workspace automation service records the first transition of each run to `running`.

Job payloads contain only the job ID, kind, resulting status, optional opaque project ID, and a stable
domain error code for failures. Automation status payloads contain the automation ID, name, and
resulting status. Run-start payloads also contain the run ID and trigger source. Activity-log failures
remain best-effort and never reverse the completed product mutation.

Emit events only after a committed insert or successful state transition. This prevents rejected
requests and duplicate status updates from producing events. Resolve target links and display names
when reading the activity log so deleted resources still fall back to safe payload metadata.

## Testing

Add focused contract/helper tests for safe payload shapes and stable error codes. Extend route and
service tests to cover user-created and API-created jobs, agent-created jobs, job cancellation and
failure, automation status changes, and a single run-start event. Verify actor kinds and credential
IDs, and assert that payloads exclude raw errors and customer content.

Run BSL header enforcement, `vp check --fix`, and `vp test` before finalizing.
