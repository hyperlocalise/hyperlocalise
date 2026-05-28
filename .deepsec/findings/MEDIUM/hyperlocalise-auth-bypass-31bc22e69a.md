# [MEDIUM] Inbound email authorization trusts spoofable From header

**File:** [`apps/hyperlocalise-web/src/api/routes/resend-webhook/resend-webhook.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/resend-webhook/resend-webhook.route.ts#L31) (lines 31)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `auth-bypass`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The route delegates signed Resend webhooks to the email bot, and signature verification is performed in the Resend adapter before JSON parsing. However, downstream authorization treats the inbound email's From address as the user identity: the adapter parses raw.from into message.author.userId, and the email handler uses that value for lookupUserByEmail and organization membership resolution. A Resend webhook signature proves the event came from Resend, not that the SMTP sender owns the From address. An attacker who learns an enabled inbound workspace address could send mail with a forged From header matching a workspace member and trigger email-agent processing and translation jobs as that member. The reviewed code does not check SPF/DKIM/DMARC/authentication-results or another provider-authenticated sender signal before trusting raw.from.

## Recommendation

Do not use the display/header From address as the sole authentication factor. Require provider-verified sender authentication results such as SPF/DKIM/DMARC pass, or use a stronger user-bound mechanism such as per-user inbound aliases, signed mail tokens, or a confirmation flow. Reject unauthenticated/spoofed inbound mail and add abuse rate limits for this public webhook path.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-21)
