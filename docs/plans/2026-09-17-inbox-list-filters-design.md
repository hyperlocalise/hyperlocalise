# Inbox list filters

## Problem

The inbox mixes conversations and issue notifications in one list. Users can mark
notifications read, but they cannot narrow the list by read state or item type.
Triage means scanning every row.

## Decision

Filter the already-loaded inbox index in the left list. Do not add conversation
read state or new list query parameters.

### Read

- **All** — conversations and notifications.
- **Unread** — notifications with no `readAt`. Conversations have no read state,
  so they stay hidden.
- **Read** — notifications with `readAt`, plus conversations.

### Type

- **All types**
- **Conversations** or a source: Chat, Email, GitHub, Slack, Web chat
- **Notifications** or a notification type: Assignment, Mention, Comment,
  Status change, Assignee change

Read and type combine. Unread + Email is empty until conversations gain unread
state.

## UI

A compact toolbar sits above the list:

1. All / Unread / Read segmented control
2. Type dropdown, grouped like the content-editor queue filter
3. Existing Mark all as read action

A filtered empty list says no items match and offers Clear filters. URL
selection still opens the detail pane if that item is hidden by the filter.

## Out of scope

Conversation unread counts, server-side type filters, URL-persisted filter
state, and Crowdin-only filter chrome. Crowdin reuses `InboxList`, so it gets
the same toolbar.
