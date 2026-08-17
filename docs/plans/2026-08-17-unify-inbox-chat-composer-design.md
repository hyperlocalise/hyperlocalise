# Unify inbox and chat-dock composers

## Goal

Inbox chat uses the same input chrome as the floating chat dock: compact rounded field, attachment, project, GitHub repo, and a visible Send button.

## Decisions

- Keep a single `ReplyComposer` implementation.
- Drop the large `default` variant. Dock compact chrome is the only look.
- Inbox conversation panel (new request and existing chat_ui threads) uses that look automatically.
- Keep Send in the toolbar and do not let the project/repo labels clip it away.

## Out of scope

- Changing composer behavior (attachments, project lock, streaming).
- Removing the floating dock.
