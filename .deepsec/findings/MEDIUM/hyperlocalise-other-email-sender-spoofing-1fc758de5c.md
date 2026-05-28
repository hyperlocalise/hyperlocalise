# [MEDIUM] Email agent address is too weak to pair with spoofable From-header authorization

**File:** [`apps/hyperlocalise-web/src/api/routes/agent-email/agent-email.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/agent-email/agent-email.route.ts#L28-L180) (lines 28, 29, 122, 130, 132, 149, 180)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-email-sender-spoofing`

## Owners

**Suggested assignee:** `22992947+MuenYu@users.noreply.github.com` _(via last-committer)_

## Finding

Enabling the email agent creates a reusable inbound alias with only 3 random bytes of entropy and exposes it as the organization inbox address. Tracing the inbound Resend flow shows the webhook signature only proves the event came from Resend; organization access is then resolved from the recipient alias and the raw From address is matched to a local user email. SMTP From is attacker-controlled unless additional provider authentication results are checked, so an attacker who learns or guesses the short alias and spoofs a member email can submit email-agent requests as that member, creating conversations/jobs and consuming provider resources.

## Recommendation

Do not treat the inbound address plus From header as authorization. Use a high-entropy per-organization or per-user secret address/token, verify authenticated sender signals from the mail provider where available, require a confirmation/challenge for new senders, and add per-organization rate limits.

## Revalidation

**Verdict:** true-positive

The short-alias part of the finding has been substantially mitigated: `generateInboundAlias` now uses `randomBytes(16).toString('hex')`, and both the API route and inbound resolver rotate legacy aliases matching the old 6-hex-character suffix. That makes blind guessing of an inbox address infeasible compared with the reported 3-byte entropy. The authorization model still relies on recipient alias plus the parsed SMTP `From` address: `ResendAdapter.parseMessage` sets `author.userId` from `raw.from`, `createEmailHandler` calls `lookupUserByEmail(senderEmail)`, and `resolveInboundEmailOrganization` checks only that this local user is a member and that the recipient alias matches an enabled connector. The Resend webhook signature proves the webhook came from Resend, not that the sender controls the email address in `From`; I found no SPF, DKIM, DMARC, or Resend authentication-result check before jobs can be queued. A concrete attack remains possible if an attacker learns the high-entropy inbound address, for example from a forwarded thread or leaked mailbox, and sends mail to it with a forged member `From` address. Because guessing is no longer practical, the severity should be reduced from HIGH to MEDIUM, but the From-header authorization weakness is still real.

## Recent committers (`git log`)

- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-05-19)
- Minh Cung <cungminh2710@gmail.com> (2026-05-19)
