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

## Authoring

- Edit prompts in markdown; use `composeInstructions()` for dynamic + DB overrides.
- Customer workspace automations stay DB-driven; templates reference `executorAgent` / `executorSkill` in skill frontmatter.
- Shared string translation: `_runtime/shared-tools/translate_string.ts` + `shared-skills/string-translation.md`.

## Legacy paths

During migration, `src/lib/agent-runtime/` and `src/lib/agents/` re-export from `src/agents/`. Prefer importing from `@/agents/...` in new code.
