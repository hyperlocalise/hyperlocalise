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
        +-- createContentfulAutomationExecutionQueue()
        |       `---------------> contentfulAutomationExecutionWorkflow (legacy fallback)
        |
        `-- provider/TMS queues
                +-- providerAgentTranslationWorkflow
                +-- providerAgentQaWorkflow
                +-- providerAgentCommentWorkflow
                `-- providerAgentWritebackWorkflow
```

## Workspace Automation Orchestrator

Workspace automations (manual, scheduled, GitHub push, Contentful webhook) create a run record and enqueue `workspaceAutomationExecutionWorkflow`. The orchestrator builds a deterministic tool plan from `toolConfig` and template skills, then executes it with `prepareStep` tool forcing:

```text
trigger (API / cron / webhook)
        |
        v
workspace-automation-dispatcher
        |
        v
workspaceAutomationExecutionWorkflow
        |
        v
runWorkspaceOrchestrator (ToolLoopAgent)
        |
        +-- run_github_workflows ----> githubRepositoryAutomationWorkflow (poll to terminal)
        +-- run_contentful_translation -> runContentfulAgent (inline)
        +-- notify_slack
        `-- notify_email
```

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
        +-- for each target locale
        |       |
        |       +-- reuseFileTranslationMemoryEntriesStep
        |       |
        |       +-- hl run
        |       |
        |       +-- validate glossary terms
        |       |       `-- retry once with validation feedback
        |       |
        |       +-- log translated file diagnostics
        |       |
        |       +-- store output file
        |       |
        |       `-- persist target TM entries best-effort
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
