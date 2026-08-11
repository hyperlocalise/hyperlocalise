# Shared chat stream ownership

## Problem

Inbox and chat dock each own a client stream runner (`useConversationStream` vs
`ChatStreamManager`). When both surfaces show the same conversation they can
each auto-start `/chat`, double-generate replies, and show divergent streaming
UI.

## Decision

`ChatStreamManager` is the only client stream owner for org chat.

- Stream snapshots live on `ChatDockStore` keyed by `conversationId`, not only
  on dock tabs.
- Dock tabs mirror snapshots when open (tab pulse / panel).
- Inbox attaches to the same snapshot; it does not create dock tabs.
- Closing or collapsing a dock tab does not abort an in-flight stream.
- `start()` is a no-op when that conversation is already streaming.

## Behavior

1. Auto-trigger (inbox or dock) calls `manager.start` only if
   `!manager.isStreaming(conversationId)`.
2. Live UI reads `store.getStreamSnapshot(conversationId)`.
3. On finish, invalidate message/conversation queries and clear the snapshot
   (existing bridge handler).
4. Remove `useConversationStream`.

## Out of scope

Working-state polish while tools run, collapsing tool results, and step-limit
empty replies.
