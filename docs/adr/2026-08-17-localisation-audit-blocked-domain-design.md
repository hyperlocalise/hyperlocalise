# Block localisation audits when domains reject the crawler

## Summary

Detect common bot-protection responses during the homepage crawl and persist a
terminal `blocked` audit instead of scoring a challenge or access-denied page.
The result tells the site owner to allow `HyperlocaliseAuditBot/1.0`, and a new
audit submission can start a fresh attempt after the owner changes the site
rules.

## Decision

Add `blocked` to the localisation audit status and `blocked` to the progress
stage. A blocked attempt is not retryable and never enters the scoring,
completion, leaderboard, or report-email paths.

Use conservative detection at the homepage boundary:

- Treat HTTP `401`, `403`, and `429` responses as blocked.
- Treat challenge pages as blocked when their HTML contains recognizable
  access-control or bot-challenge language, including CAPTCHA, Cloudflare
  challenge markers, “verify you are human”, “access denied”, and “request
  blocked”.
- Leave ordinary timeouts, connection failures, and unrelated `5xx` responses
  as failed so they retain the existing retry behavior.

## Flow

1. The crawl returns an optional `blockedReason` before parsing pages for
   scoring.
2. The analysis step calls `blockLocalisationAudit` and returns a non-success
   result without building a company profile or running credits.
3. The workflow stops without queueing pending report emails.
4. Public API responses expose `status: "blocked"`, no retryable flag, and the
   stored owner-facing message. Unlock requests for blocked audits are rejected.
5. A new POST for the same domain may reclaim the blocked row and create a new
   attempt; a blocked audit is never automatically retried.

## UI

Render a dedicated blocked state instead of the score report or failed-retry
state. Explain that the domain blocked Hyperlocalise's crawler, show the
allow-list identity, and provide a link to start a new audit. Do not offer a
retry button on the blocked result.

## Verification

Cover status and challenge-content detection, crawl propagation, analysis
short-circuiting, blocked persistence, blocked email rejection, reclaiming only
through a new submission, and the blocked result Storybook state. Run the
focused audit tests and the web app's `vp check --fix` command.
