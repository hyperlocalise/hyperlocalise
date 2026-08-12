# CAT Visual Editor (Storybook prototype)

## Problem

CAT is string-queue first (comfortable / side-by-side / file). Product wants an
in-context **Visual Editor** for website pages: browse files, click live preview
nodes, edit translations beside intelligence. Ship a Storybook-only shell first
so layout and interaction can iterate before route wiring.

## Decision

Add a presentational `CatVisualEditorWorkspace` under
`apps/hyperlocalise-web/src/components/cat/visual-editor/`. Expose it only via
Storybook. Reuse production building blocks; mock the preview canvas.

Translator UX rules for this prototype:

- Preview is select + live reflect only (no inline edit popup).
- Right rail is the single edit surface; Approve/Save stay sticky.
- Quieter highlights; status dots mark unfinished strings.
- Approve advances to the next open string; Tab jumps to next open.

## Architecture

Three panes:

| Pane | Reuse | New |
|------|-------|-----|
| Left | `ProjectFilesTree` | Progress strip, files sidebar chrome |
| Center | UI (`Button`, `Switch`, `Input`, `Kbd`) | Device/URL toolbar, mock page preview, selection highlight, inline edit popup |
| Right | `CatEditorHeader`, source/target/AI/comments/actions + `CatIntelligencePanel` | Detail panel shell that stacks editor sections above intelligence |

State is local to the Storybook host (selected file, selected node/segment,
target draft, highlight toggle, device). No MobX orchestrator, no API routes,
no `CatWorkspaceViewMode` change in this slice.

## Data

Fixtures mirror the Acme homepage mock: `pages/home.json` and siblings, `de-DE`
segments with DOM node metadata (`tagName`, selector), intelligence tuned for
the hero H1.

## Out of scope

- App routes / view-mode toggle
- Real iframe or crawler preview
- Persisted edits
- Mobile compact layout parity with production CAT tabs

## Testing

Storybook stories with play functions covering: file tree mounts, node
selection updates the detail panel, target edits sync into the preview.
