# [BUG] Inbound email resolver only checks one connector per sender

**File:** [`apps/hyperlocalise-web/src/lib/agents/email/organizations.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/email/organizations.ts#L95-L126) (lines 95, 111, 118, 124, 126)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `22992947+MuenYu@users.noreply.github.com` _(via last-committer)_

## Finding

resolveInboundEmailOrganization extracts inbound aliases from recipientAddresses, but for each alias it queries enabled email connectors only by sender membership and then applies .limit(1). The SQL query does not filter by the alias, so a user who belongs to multiple organizations with email agents can receive an arbitrary first connector that does not match the addressed alias. The code then rejects that connector in memory and may return null without ever inspecting the matching organization, causing valid inbound email requests and conversation tracking to fail for multi-workspace users.

## Recommendation

Filter the connector lookup by config.inboundEmailAlias in the database, or fetch all enabled email connectors for the sender and match aliases deterministically in memory. Consider adding a unique partial index for email aliases if aliases are intended to be globally unique.

## Recent committers (`git log`)

- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-05-19)
- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
