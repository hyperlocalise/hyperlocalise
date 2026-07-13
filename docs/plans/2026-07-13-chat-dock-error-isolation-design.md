# Chat dock error isolation

## Decision

Wrap only the expandable chat dock panel in a client-side error boundary. Keep the
chat bridge, footer controls, plan usage, support link, and application shell outside
the boundary so they remain usable when the panel fails to render.

## Recovery

The fallback appears in the dock's normal panel area and offers two local actions:

- **Try again** clears the active tab's transient stream error, invalidates its
  conversation data, and rerenders the panel.
- **Close chat** collapses the failed panel without deleting the tab or its draft.

Changing organizations resets the boundary. Unexpected errors are logged with the
chat-dock scope and React component stack, consistent with the app's existing panel
boundaries.

## Testing

Render a failing child inside the boundary and verify that the local fallback appears
while content outside the boundary remains available. Verify that retry rerenders the
child and that closing the fallback collapses the dock without deleting its tab.
