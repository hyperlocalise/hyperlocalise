# Chat dock error isolation

## Decision

Wrap only the expandable chat dock panel in a client-side error boundary. Keep the
chat bridge, footer controls, plan usage, support link, and application shell outside
the boundary so they remain usable when the panel fails to render.

## Recovery

The fallback appears in the dock's normal panel area and offers two local actions:

- **Try again** clears the failed tab's transient stream error, invalidates its
  conversation data, and rerenders the panel.
- **Close chat** collapses the failed panel without deleting the tab or its draft.

Changing organizations, switching tabs, or closing the panel resets the boundary
through `resetKeys`. Reset always runs the same recovery cleanup against the tab
that originally failed, so switching away while the fallback is visible does not
leave that tab's stream snapshot, last error, or message cache stale.

Unexpected errors are logged with the chat-dock scope, error name, and React
component stack. Message and stack text are omitted so conversation content or
API bodies cannot leak into logs.

## Testing

Render a failing child inside the boundary and verify that the local fallback appears
while content outside the boundary remains available. Verify that retry rerenders the
child, that closing the fallback collapses the dock without deleting its tab, and that
switching tabs while the fallback is visible clears the failed tab's transient stream
state so returning to it does not revive the same failure.
