# Localisation audit crawl access note

## Summary

Show a short owner-facing note in the public localisation audit page's “What we
notice” section so a site owner can allow Hyperlocalise through a firewall, CDN,
bot check, or login wall. Rename the crawler identity to the product-ready
`HyperlocaliseAuditBot/1.0 (+https://hyperlocalise.com)` and use the same value in
the note.

## Decision

Place a semantic note directly below the three methodology cards in the “What
we notice” section. The note is informational and does not add a step, change
the audit API, or change crawl permissions. The form remains focused on URL and
language inputs and submission.

The note will use concise localized copy:

- Heading: `Site owner note`
- Body: `If your site is behind a firewall, CDN, bot check, or login wall, allow
  HyperlocaliseAuditBot/1.0 to access public pages so we can complete the
  audit.`

The existing scope copy remains the source of truth for the audit boundary: only
public pages are read, and the crawler never signs in or fills in forms.

## Implementation

1. Change the crawl module's shared `User-Agent` value to
   `HyperlocaliseAuditBot/1.0 (+https://hyperlocalise.com)`.
2. Add localized messages for the owner-note heading, body, and user-agent label.
3. Render the messages in an accessible `<aside>` below the methodology cards,
   using existing Tailwind theme tokens.
4. Update the landing-page Storybook interaction to assert that the note and
   product-ready user-agent name are visible in the methodology section.

No database, API, auth, robots, or crawler control-flow changes are required.

## Verification

Run the localisation-audit component tests and Storybook checks through the
web app's required `vp test` and `vp check --fix` commands. Also search the
repository to confirm the old crawler identity is gone and the new identity is
used consistently in the crawl implementation and owner-facing copy.
