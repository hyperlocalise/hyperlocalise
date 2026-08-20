# Inbox sidebar unread badge

## Problem

The sidebar Inbox item already fetches unread notification count, but the badge
caps at `99+` and uses default sidebar text color. Unread state is easy to miss,
especially across light and dark themes.

## Decision

Keep the existing unread-count query on Inbox. Change only display:

1. Cap the label at `9+` when count is greater than 9 (same rule as overview
   attention badges).
2. Hide the badge when count is 0 or still loading with no data.
3. Style the badge as a solid red pill using `destructive-solid` background and
   `destructive-foreground` text so contrast stays readable in light and dark
   mode.
4. Keep white/red colors on hover and active menu states so peer text overrides
   do not wash out the badge.

## Behavior

| Unread count | Badge |
| --- | --- |
| 0 / unknown | none |
| 1–9 | exact number |
| 10+ | `9+` |

## Out of scope

Collapsed icon-mode badge placement, unread conversation counts (non-notification
inbox threads), and toast/dot alternatives.
