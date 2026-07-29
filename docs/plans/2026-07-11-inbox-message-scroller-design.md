# Inbox message scroller design

## Goal

Improve the Hyperlocalise inbox transcript without changing its agent transport, persistence, or rich AI content renderers.

## Scope

- Replace the inbox transcript shell with shadcn `MessageScroller`.
- Replace inbox message-row layout with shadcn `Message`.
- Use shadcn `Marker` for the active agent status.
- Retain the existing AI Elements markdown, reasoning, source, tool, and attachment rendering.

## Interaction model

- Each persisted or streamed message is a `MessageScrollerItem` with its stable message ID.
- User messages anchor a turn; saved threads reopen at the latest user anchor.
- The scroller follows streamed output only while the reader remains at the live edge.
- The in-progress agent response shows a status marker. It is not persisted as a normal message and is announced as a status update.

## Validation

- Run the focused inbox component tests if present.
- Run `vp check --fix` and the applicable `vp test` suite from `apps/hyperlocalise-web`.
