# Inbox New Request compose page

## Goal

Sidebar **New Request** opens a full inbox page with a dedicated empty chat, instead of the floating chat dock.

## Decisions

- Navigate to `/org/:slug/inbox/new`.
- Reuse the inbox list + detail layout.
- Show a pending chat (empty state, suggestion chips, composer) until the first send.
- Create the conversation with `POST /api/orgs/:slug/conversations`, then go to `/inbox/:conversationId`.
- Keep Inbox inactive on `/inbox/new`; New Request is exact-active there.
- Redirect `/org/:slug/chat` to `/inbox/new`.
- Leave the footer dock and dashboard CTAs on `ChatDockStore.openNewTab()`.

## Out of scope

- Removing the chat dock.
- Syncing dock tabs with inbox selection.
- Crowdin embed New conversation flow.
