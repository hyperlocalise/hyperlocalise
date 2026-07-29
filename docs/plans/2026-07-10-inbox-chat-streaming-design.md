# Inbox chat streaming

## Problem

Web inbox agent turns feel unresponsive. The client waits through classify, sandbox setup, and tool/subagent work with only a typing indicator. When text finally arrives, it is a plain dump. Tool and reasoning UI already exists in the inbox message list, but the server never sends those parts.

Root causes:

1. `@chat-adapter/web` only forwards text (`text-start` / `text-delta` / `text-end`). Tool and reasoning chunks are dropped.
2. `runWebChatAgentTurn` awaits full turn prep before any stream opens.
3. Persisted messages store only `text`, so history cannot show tool cards after refresh.

## Decision

**Bypass Chat SDK web-adapter response body for inbox chat.** Keep auth and agent runtime. Stream AI SDK UIMessage parts directly. Persist text plus a parts snapshot.

Out of scope for this pass: CAT Find context streaming, Slack/email/GitHub streaming, nested subagent step progress beyond the parent `task` tool card, and migrating to `useChat`.

## Architecture

```
Client
  DefaultChatTransport + readUIMessageStream   (protocol unchanged)
        │
        ▼
POST /api/orgs/:slug/conversations/:id/chat
  auth + access checks                         (keep)
  open UIMessage SSE immediately               (new)
  emit prep status part                        (new)
  prepareConversationAgentTurn()               (keep, overlaps stream)
  agent.stream() → toUIMessageStream()         (new)
  persist text + parts snapshot                (extend)
```

Do not use `bot.webhooks.web` + `thread.post(textStream)` for the agent reply. That path cannot carry tool parts. Clarification-only replies can still return a short UIMessage text stream or a non-stream JSON path if simpler.

## Behavior

1. After auth, open the UIMessage stream within ~100–300ms.
2. Write a status/data part (for example “Preparing…”) before classify/sandbox finish.
3. Run classify, repository resolution, and sandbox creation while the stream is open.
4. Stream full UIMessage parts: tool calls, tool results, reasoning (if present), text deltas.
5. On finish or abort: release sandbox lease, track usage, persist the assistant message.
6. Abort signal from the client cancels server work.

## Persistence (option A)

Add nullable JSONB `parts` on `interaction_messages`:

- Store the final assistant `UIMessage.parts` snapshot after the stream completes.
- Keep `text` as the concatenated text parts for list previews, search, and non-web channels.
- User messages stay text-only (`parts` null).
- Message list API returns `parts` when present; inbox UI reconstructs `UIMessage` for agent history.

Migration via Drizzle (`vp run db:generate`) after schema change. No backfill required; old rows render as text-only.

## Client

- Keep `useConversationStream` + `DefaultChatTransport` + `readUIMessageStream`.
- Render streamed and persisted parts through existing `AssistantMessageParts`.
- On stream finish, refetch conversation messages so the persisted row replaces the ephemeral stream message.
- Optional small polish: map prep status parts to a short status line instead of a bare typing indicator.

## Server touchpoints

| Area | Change |
|------|--------|
| `chat-stream.route.ts` | Direct UIMessage SSE; drop Chat SDK webhook for this route |
| `channels/web.ts` | Return/consume `toUIMessageStream`; prep status; usage + sandbox lease |
| `interactions.ts` + schema | Accept and store `parts` |
| Conversation message API | Include `parts` in message payloads |
| Inbox message mapping | Hydrate agent messages from `parts` when present |

## Error handling

- Prep failures after stream open: write an error chunk / assistant text, then finish.
- Clarification follow-ups: stream or post a single text assistant message; persist as today.
- Abort: stop iteration, release lease, do not persist a partial agent message unless a useful partial already exists (prefer no partial persist in v1).
- Usage tracking: succeed only after a completed stream, matching current intent.

## Testing

- Unit: web channel builds a UIMessage stream with tool + text parts; prep status emits before agent tokens.
- Route: authenticated chat endpoint returns UI message stream content-type; abort closes cleanly.
- Persistence: `addInteractionMessage` stores parts; message GET returns them.
- Client mapping: history with parts renders tool cards; text-only history still works.
- Keep existing clarification and non-repo chat coverage green.

## Success criteria

- First stream event arrives before sandbox/classify finish.
- Tool cards appear while tools run.
- Text streams token-by-token.
- Refresh preserves tool cards for new agent messages.
- Stop/abort cancels server work.
- Clarification follow-ups still work.

## Follow-ups (not this PR)

- CAT Find context SSE using the same UIMessage contract.
- Coarse nested progress inside `task` / repository subagent.
- Slack and other channels remain `generate()` until separately scoped.
