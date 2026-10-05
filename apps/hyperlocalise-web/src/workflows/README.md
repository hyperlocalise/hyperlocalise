# Workflow Agent Flows

This folder contains workflow entrypoints started through `adapters.ts`.

Agent packages live under [`src/agents/`](../agents/README.md).

Current agent scope:

- Hyperlocalise conversational agent (`hyperlocalise/agent`) translates uploaded files and delegates to subagents.
- Repository subagent reads repository context for localized messages or strings.
- Workspace automations run via `automations/workspace/agent` orchestrator ToolLoopAgent.
- Contentful translation is invoked inline by the workspace orchestrator via `automations/contentful/agent`.
- TMS/provider agent workflows use `automations/provider-tms/agent` executors.

## Queue Adapter

```text
API / bot / tool caller
        |
        v
apps/hyperlocalise-web/src/workflows/adapters.ts
        |
        +-- createTranslationJobEventQueue()
        |       +-- file event ----> fileTranslationJobWorkflow
        |       `-- other event ---> translationJobWorkflow
        |
        +-- createEmailAgentTaskQueue()
        |       `---------------> emailTranslationWorkflow
        |
        +-- createRepositoryAgentTaskQueue()
        |       `---------------> repositoryAgentWorkflow
        |
        +-- createWorkspaceAutomationExecutionQueue()
        |       `---------------> workspaceAutomationExecutionWorkflow
        |
        +-- createVisualWorkflowExecutionQueue()
        |       `---------------> visualWorkflowExecutionWorkflow
        |
        `-- provider/TMS queues
                +-- providerAgentTranslationWorkflow
                +-- providerAgentQaWorkflow
                +-- providerAgentCommentWorkflow
                `-- providerAgentWritebackWorkflow
```

## Workspace Automation Orchestrator

Workspace automations (manual, scheduled, GitHub push, Contentful webhook) create a run record and enqueue `workspaceAutomationExecutionWorkflow`. The orchestrator builds a deterministic tool plan from `toolConfig` and template skills, then executes it as a `WorkflowAgent` (`@ai-sdk/workflow`) with `prepareStep` tool forcing.

Each orchestrator model call and each planned tool runs in its own durable step, so every tool gets a full function duration (`maxDuration`) instead of sharing one. Tool steps reload the run and rebuild the session, then return the updated `stepResults` and terminal status as plain data. A tool that throws becomes an error tool result rather than a step retry, so side-effecting tools are not re-run. Billing reserves one `agent_runs` unit when the run is prepared and settles it with the agent's total token usage on completion.

Long tools are durable loops of their own, and the orchestrator deadline adds each planned tool's budget:

- `use_github_repository` and `use_gitlab_repository` start a sandbox that lives for the whole review, then run a nested `WorkflowAgent` with one step per model call and per repository tool call. The sandbox is reached by id from every step, and the finish or fail step stops it. The repository agent bills its own `agent_runs` unit.
- `run_github_workflows` dispatches the job in one step, then checks its status in short steps separated by durable `sleep()` calls, so waiting costs no function time.

A retried step re-runs its tool, so side-effecting tools record each call in `workspace_automation_tool_attempts` keyed by `(run_id, tool_call_id)`. A replay returns the recorded outcome. A call left in `started` by a crashed attempt is not repeated, and reports `<tool>_outcome_unknown`. Read-only tools and tools that deduplicate their own side effects skip the ledger.

Every tool step checks the run status. Once a run is `cancelled`, tool steps stop starting work, the agent loops stop, and the run keeps its `cancelled` status on completion.

```text
trigger (API / cron / webhook)
        |
        v
workspace-automation-dispatcher
        |
        v
workspaceAutomationExecutionWorkflow
        |
        +-- prepareWorkspaceAutomationStep (plan, mark running, reserve usage; content sync runs here)
        |
        v
WorkflowAgent (one step per model call)
        |
        +-- executeWorkspaceOrchestratorToolStep (one step per planned tool)
        |
        +-- use_github_repository / use_gitlab_repository
        |       start sandbox -> nested WorkflowAgent (one step per model / repository tool call) -> finish
        +-- run_github_workflows ----> githubRepositoryAutomationWorkflow (status step + durable sleep)
        +-- run_contentful_translation -> runContentfulAgent -> run_translation tool (executor)
        +-- notify_slack
        `-- notify_email
        |
        v
completeWorkspaceAutomationStep (terminal status, output summary, settle usage)
```

## Visual Workflow Execution

Visual workflows use immutable published definitions for production runs and isolated snapshots for mock/live draft tests. Run creation inserts a transactional dispatch outbox. Expiring worker claims and scheduler reconciliation recover abandoned dispatches. Each `executeVisualWorkflowStep` restores completed node results and performs at most one new external action, then continues in another durable step. See the visual workflow README below for credential handling, loop scope, cancellation, and recovery.

```text
POST /api/orgs/:slug/visual-workflows/:id/runs
        |
        v
dispatchManualVisualWorkflowRun
        |
        v
createVisualWorkflowExecutionQueue
        |
        v
visualWorkflowExecutionWorkflow
        |
        v
executeVisualWorkflowStep -> runVisualWorkflowInterpreter
        |
        +-- trigger.manual
        +-- action.http
        +-- logic.if (true/false edges)
        `-- ai.agent (organization AI Engine)
```

Implementation details live in [`src/lib/visual-workflows/README.md`](../lib/visual-workflows/README.md).

## Hyperlocalise Agent: Uploaded File Translation

The chat and Slack agents create a translation job from stored uploaded files. The workflow translates the source file in a sandbox and stores translated output files.

```text
user uploads file + target locale
        |
        v
createTranslationJobTool
        |
        v
createTranslationJobEventQueue
        |
        v
fileTranslationJobWorkflow
        |
        +-- claimTranslationJobStep
        |
        +-- get project + source stored file
        |
        +-- create translation sandbox
        |
        +-- assemble context
        |       +-- project translation context
        |       +-- attached approved glossary terms
        |       `-- job metadata context
        |
        +-- extract source entries for TM reuse
        |
        +-- assemble locale-keyed prefill (TM + project translations)
        |
        +-- hl run (all target locales, nested --prefilled-entries)
        |
        +-- on sandbox disconnect: retry same sandbox without --force (lockfile resume), else recreate
        |
        +-- per locale: validate glossary
        |
        +-- retry hl run for glossary-failed locales only
        |
        +-- per locale: log diagnostics, store output, persist TM
        |
        +-- completeFileTranslationJobStep
        |
        `-- finally stop sandbox
```

Failure path:

```text
any workflow error
        |
        v
userFacingFailureReason
        |
        v
failTranslationJobStep
        |
        v
stop sandbox
```

## Repository Agent: Localized String Context

The repository agent is read-only. It creates a GitHub-backed sandbox when repository context is resolved, exposes only repo read tools, and asks the model to explain where localized strings/messages appear.

```text
Slack / GitHub / chat repository-context request
        |
        v
resolve repository or PR context
        |
        v
createRepositoryAgentTaskQueue
        |
        v
repositoryAgentWorkflow
        |
        +-- createRepositorySandboxStep
        |       `-- only when GitHub context is resolved
        |
        +-- build read-only ToolContext
        |
        +-- buildTools
        |       +-- grep
        |       +-- read
        |       +-- glob
        |       `-- detectRepoConfig
        |
        +-- ToolLoopAgent.generate
        |       `-- locate literal localized strings/messages
        |           and explain surrounding repository context
        |
        +-- return summary to source thread
        |
        `-- finally stop repository sandbox
```

The repository agent must not:

```text
modify files
upload sources
commit
push
create jobs
call provider/TMS tools
```

## Email Agent: Attachment Translation

The email agent receives an email task with attachments and replies by email with translated attachments.

```text
inbound email webhook
        |
        v
email intent + attachments
        |
        v
createEmailAgentTaskQueue
        |
        v
emailTranslationWorkflow
        |
        +-- mark email translation job running
        |
        +-- create sandbox
        |
        +-- prepare sandbox and install hl if needed
        |
        +-- download attachment
        |
        +-- write temporary hl config
        |
        +-- hl run
        |
        +-- read translated file
        |
        +-- log diagnostics
        |
        +-- send reply email with translated attachment
        |
        +-- mark email translation job succeeded
        |
        `-- stop sandbox
```

Failure path:

```text
workflow error
        |
        +-- send failure reply email when possible
        |
        +-- mark email translation job failed
        |
        `-- stop sandbox
```

## Provider/TMS Workflows

These workflows exist for provider-side agent runs, but provider/TMS tools are not exposed to the conversational Hyperlocalise or repository agents for now.

TODO: Wire these into the next TMS agent scope after the agent-facing tool contract is defined.

### Provider Translation

```text
provider agent translation event
        |
        v
providerAgentTranslationWorkflow
        |
        +-- executeProviderAgentTranslationStep
        |       `-- executeProviderAgentTranslation
        |
        `-- on error
                `-- failProviderAgentTranslationStep
```

### Provider QA

```text
provider agent QA event
        |
        v
providerAgentQaWorkflow
        |
        +-- prepareProviderAgentQaStep
        |       `-- pull provider task content
        |
        +-- if already completed
        |       `-- return existing report
        |
        +-- runProviderHlCheckSandboxStep
        |       `-- materialize provider content and run hl check
        |
        +-- completeProviderAgentQaStep
        |       `-- write agent run output and optional provider review sync
        |
        `-- on error
                `-- failProviderAgentQaStep
```

### Provider Comment

```text
provider agent comment event
        |
        v
providerAgentCommentWorkflow
        |
        +-- executeProviderAgentCommentStep
        |       `-- executeProviderAgentComment
        |
        `-- on error
                `-- failProviderAgentCommentStep
```

### Provider Writeback

```text
provider agent writeback event
        |
        v
providerAgentWritebackWorkflow
        |
        +-- executeProviderAgentWritebackStep
        |       `-- executeProviderAgentWriteback
        |
        `-- on error
                `-- failProviderAgentWritebackStep
```
