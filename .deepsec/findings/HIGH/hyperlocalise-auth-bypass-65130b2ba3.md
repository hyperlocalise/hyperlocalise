# [HIGH] Inbound email agent trusts spoofable From address as workspace identity

**File:** [`apps/hyperlocalise-web/src/lib/agents/email/bot.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/email/bot.ts#L634-L966) (lines 634, 646, 751, 791, 828, 923, 966)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `auth-bypass`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

handleEmail takes message.author.userId as senderEmail and uses lookupUserByEmail(senderEmail) plus resolveInboundEmailOrganization to authorize the request. The traced Resend adapter sets message.author.userId from the inbound email's raw From value after verifying only the webhook signature; that signature proves delivery via Resend, not ownership of the claimed From mailbox. An attacker who can send mail to a workspace inbound alias with a spoofed member From address can be treated as that member, have messages stored under that identity, invoke the intent/image/translation flows, and enqueue jobs against the organization.

## Recommendation

Do not use the RFC5322 From address alone for authorization. Require a sender-authenticated signal from the inbound provider, such as SPF/DKIM/DMARC pass tied to the From domain, verified envelope sender, or provider-verified identity, or bind inbound requests to per-user/per-org unguessable addresses or signed challenge tokens before creating jobs or invoking AI.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
