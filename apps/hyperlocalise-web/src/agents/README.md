# Hyperlocalise runtime agents

Filesystem-first agent packages for product runtime AI. Cursor coding-agent skills live in repo-root `.agents/skills/` and are unrelated to this tree.

## Layout

```
src/agents/
├── _runtime/           # Loader, compose-instructions, shared tools/skills
├── hyperlocalise/      # Conversational orchestrator + subagents
├── email/
└── automations/        # workspace, contentful, github-repository, provider-tms
```

Each package uses Eve-inspired slots under `agent/`:

| Path              | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `agent.ts`        | Model, step limits, ToolLoopAgent factories |
| `instructions.md` | Always-on system prompt                     |
| `tools/`          | Typed tools (filename → tool name)          |
| `skills/`         | On-demand procedures (markdown)             |
| `channels/`       | Slack, web, webhooks                        |
| `schedules/`      | Cron ticks                                  |
| `subagents/`      | Specialist child agents                     |

## Workspace automations

`automations/workspace/agent` is the unified executor for customer workspace automations. It composes instructions from `instructions.md`, template skills, and customer overrides, then runs a hybrid orchestrator:

- **Plan**: deterministic tool order from `toolConfig` and `executorAgent` skill metadata
- **Execution**: `ToolLoopAgent` with `prepareStep` forcing each planned tool
- **Tools**: GitHub workflows, Contentful translation, Slack, and email notifications

Child executors remain specialized packages (`contentful`, `github-repository`) but are invoked as orchestrator tools rather than separate dispatch branches.

## Conversational skill agent

The Hyperlocalise conversational agent resolves capability skills from `hyperlocalise/agent/skills/` via `conversation-skill-registry.ts`. No intent classifier routes the agent — skills activate from runtime context:

| Skill               | Activates when                                     |
| ------------------- | -------------------------------------------------- |
| `conversation`      | always (includes project resolution tools)         |
| `tms-tools`         | external TMS integrated                            |
| `repo-tools`        | GitHub sandbox is connected                        |
| `find-context`      | GitHub sandbox is connected                        |
| `translation-tools` | always (`createTranslationJob` when files/project) |

Skill frontmatter declares `tools`, `sharedSkills`, and context requirements (`requiresSandbox`, `requiresTmsIntegration`, `requiresProjectOrAttachments`). The agent uses whichever skills and tools are available for the turn.

## Authoring

- Edit prompts in markdown; use `composeInstructions()` for dynamic + DB overrides.
- Customer workspace automations stay DB-driven; templates reference `executorAgent` / `executorSkill` in skill frontmatter.
- Shared string translation: `_runtime/shared-tools/translate_string.ts` + `shared-skills/string-translation.md`.

## Legacy paths

During migration, `src/lib/agent-runtime/` and `src/lib/agents/` re-export from `src/agents/`. Prefer importing from `@/agents/...` in new code.
