# Floating chat dock design

## Goal

Make chat available without compressing the application workspace. The dock should feel like a focused utility window rather than a full-width page section.

## Design

The expanded chat is a fixed bottom-right panel on desktop and uses narrow viewport gutters on mobile. It has a compact header for the conversation title, Inbox link, minimize action, and close action. Messages own the flexible middle region, while the composer remains pinned to the bottom of the panel.

The composer uses a short, growing textarea and a single compact control row. Existing conversation, streaming, attachment, repository selection, and persistence behavior remains unchanged.

The global footer continues to expose chat tabs and a labeled new-request action, but opening the panel no longer changes application content height.

## Validation

- Existing chat dock store and component tests continue to pass.
- The web app type and style checks pass.
- The panel remains usable in both themes and at mobile viewport widths.
