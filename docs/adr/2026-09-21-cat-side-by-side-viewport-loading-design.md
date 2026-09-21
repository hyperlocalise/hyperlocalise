# CAT side-by-side viewport loading

## Decision

Side-by-side CAT no longer treats hover as "open this segment." Hover is visual
only. Translations load for rendered rows. The intelligence panel and comments
follow the focused row. QA waits until the target has hydrated, and empty
translation flags appear only on the focused row.

## Why

Queue rows omit target text. Hover used to switch intelligence, fetch comments,
and run QA against an empty draft. Scrolling the list then flagged
`not_localized` on strings the reviewer had not looked at.

## Behavior

- **Load:** fetch targets for virtualizer rows, including overscan.
- **Show:** keep a skeleton until `hasHydratedTarget`. After a target request
  errors, exhausts retries, or stays disabled, drop the skeleton and show the
  editor so the reviewer can keep working. Do not show "Click to translate" or
  empty QA while the target is still in flight.
- **QA:** run quiet checks on viewport rows that already have text. Flag empty
  translations only after the reviewer focuses the row.
- **Intelligence:** stay on `selectedSegmentId`. Mouse movement does not load
  comments, TM, or the right-hand panel.

## Verification

Run `vp test` and `vp check --fix` from `apps/hyperlocalise-web`.
