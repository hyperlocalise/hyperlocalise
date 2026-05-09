# [HIGH] Email agent address is too weak to pair with spoofable From-header authorization

**File:** [`apps/hyperlocalise-web/src/api/routes/agent-email/agent-email.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/agent-email/agent-email.route.ts#L28-L180) (lines 28, 29, 122, 130, 132, 149, 180)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `other-email-sender-spoofing`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Enabling the email agent creates a reusable inbound alias with only 3 random bytes of entropy and exposes it as the organization inbox address. Tracing the inbound Resend flow shows the webhook signature only proves the event came from Resend; organization access is then resolved from the recipient alias and the raw From address is matched to a local user email. SMTP From is attacker-controlled unless additional provider authentication results are checked, so an attacker who learns or guesses the short alias and spoofs a member email can submit email-agent requests as that member, creating conversations/jobs and consuming provider resources.

## Recommendation

Do not treat the inbound address plus From header as authorization. Use a high-entropy per-organization or per-user secret address/token, verify authenticated sender signals from the mail provider where available, require a confirmation/challenge for new senders, and add per-organization rate limits.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
