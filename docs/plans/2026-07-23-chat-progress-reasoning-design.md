# Chat progress and reasoning summaries

## Problem

Long-running agent tools can leave chat users with a generic working indicator for several
minutes. `captureScreenshot` is the clearest example: one tool call resolves Storybook, prepares
the browser runtime, starts Storybook, loads the story, captures an image, and stores the result.
The model cannot emit more text while it waits for that tool call.

The web stream also emits `Preparing…` and `Thinking…` as transient data parts, but the inbox
reader does not retain transient parts in the streamed message. The UI therefore never renders
those statuses. Reasoning parts are supported in the UI, but the OpenAI request does not currently
ask for a reasoning summary.

## Decision

Keep `captureScreenshot` as one agent-facing tool and add a request-scoped progress emitter to the
tool context. The tool will report semantic phases without percentages:

1. Resolving Storybook
2. Preparing the browser and starting Storybook
3. Loading the story
4. Capturing the screenshot
5. Uploading the screenshot

Progress data parts use the tool call ID as their stable stream ID. A new update replaces the
previous phase for that tool call. Data parts remain excluded from persisted assistant messages.

Request concise, model-provided OpenAI reasoning summaries with `reasoningSummary: "auto"`.
Continue forwarding reasoning chunks through the AI SDK UI stream and render them with the existing
collapsible reasoning component. Do not expose provider metadata or manufacture chain-of-thought.

## Data flow

```text
createWebChatAgentUIStreamResponse
  → create a writer-bound progress emitter for this request
  → pass it through prepareConversationAgentTurn into ToolContext
  → captureScreenshot reports phases with its toolCallId
  → data-toolProgress replaces the prior phase in the streamed UIMessage
  → ConversationMessageList renders the current phase beside the running tool
```

Prep status parts will be non-transient so the existing `readUIMessageStream` client receives them
as message parts. The persistence filter already removes all `data-*` parts.

## Safety and failure behavior

- Progress messages are fixed product strings. They never contain user input, file contents,
  credentials, repository names, or command output.
- The emitter exists only inside one web request. Other channels omit it and tools no-op.
- Tool errors continue to use the existing tool error state. The last progress phase is hidden once
  the tool completes or fails.
- Read-only members continue to have persisted reasoning and tool details redacted by the existing
  conversation message policy.

## Testing

- Unit-test that OpenAI reasoning summaries are requested.
- Unit-test that turn preparation forwards the request-scoped emitter.
- Unit-test screenshot phase ordering and the no-emitter path.
- Test stream data-part replacement and persistence filtering.
- Test the message UI with prep status, running tool progress, completed tools, and reasoning.
- Run `vp test` and `vp check --fix`.
- Manually exercise the chat UI and record the visible progress and reasoning behavior.

## Success criteria

- Users see a meaningful status before model output starts.
- Screenshot capture reports truthful phases while the tool remains one coherent action.
- Completed and failed tools do not retain a misleading running status.
- Concise provider reasoning summaries appear in the existing collapsible reasoning UI when the
  model supplies them.
- No progress data is persisted or exposed to channels that do not support it.

## Workflow-level visual mock progress

Screenshot callbacks cannot describe decisions that happen between tools. In particular, finding
that no suitable Storybook story exists and creating a temporary story with mock data spans search,
read, write, and patch calls.

Use the existing `todoWrite` tool as the workflow-level progress contract:

1. The visual-mock skill creates a three-step checklist before repository inspection.
2. If no story exists, it changes the preview step to “No story found — create a temporary
   Storybook story with mock data.”
3. It marks one step in progress at a time and updates the complete list after each milestone.
4. The chat renders only the latest `todoWrite` call as an accessible checklist. Older checklist
   tool calls remain in the message protocol but are hidden to avoid duplicate plans.
5. The checklist is derived from the tool input while running and its output after completion. It
   remains part of the existing tool history and requires no second progress transport.

The custom checklist renderer applies only to `todoWrite`. Other tools retain their existing cards.
Malformed todo output falls back to the normal tool renderer.
