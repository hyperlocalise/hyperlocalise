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

## Revalidation

**Verdict:** true-positive

The Resend webhook route is intentionally unauthenticated by WorkOS and delegates to the Resend adapter after Svix verification; that signature proves the webhook came from Resend, not that the SMTP sender owns the RFC5322 From mailbox. In `ResendAdapter.handleWebhook`, `data.from` is copied into `rawMessage.from`, and `parseMessage` parses that raw From value into `author.userId`. `createEmailHandler` then assigns `const senderEmail = message.author.userId`, calls `lookupUserByEmail(senderEmail)`, and passes the resulting local user id into `resolveInboundEmailOrganization`. Organization resolution checks that the looked-up user is a member of an enabled connector's organization and that the recipient alias matches, but it never validates SPF, DKIM, DMARC, envelope sender, or any provider-authenticated sender identity. A concrete attacker who knows an active inbound alias and a member email can send an email to that alias with the member address in From, include a supported attachment and target locale, and the handler will create conversation messages, fetch Resend attachment URLs, create a job under the organization, and enqueue translation work. The random inbound alias is an additional secret-like prerequisite, but once the alias is known the From address alone is sufficient to impersonate a workspace member. I found no framework-level or adapter-level mitigation that binds the sender to a verified mailbox, so the auth-bypass finding is real.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
