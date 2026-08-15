# Localisation audit result Open Graph image

## Goal

Give each public localisation audit result page a shareable Open Graph image that
matches the audit landing visual language (sage mesh) and surfaces the four
dimension scores.

## Design

- Route: `apps/hyperlocalise-web/src/app/[lang]/(marketing)/localisation-audit/[domainSlug]/opengraph-image.tsx`
- Helper: `createLocalisationAuditResultOgImage` in `src/lib/og/`
- Canvas: 1200×630 PNG via `next/og` `ImageResponse`
- Background: sage mesh gradient (`images/mesh/mesh-gradient-1784864073608.jpg`, same
  asset as the audit landing form) with a dark scrim for readable type
- Brand lockup: Hyperlocalise logo + company name
- Subject: audited `domainKey` under a short “Localisation audit” label
- Scores: Technical, Linguistic, Contextual, Visual circles using the same tone
  colors as the report email (`emailAuditToneColor` / `emailAuditToneFill`)
- Missing scores render as `N/A`
- Unknown or invalid slugs fall back to the standard marketing OG template

## Data

Reads the audit row by `domainSlug`. Dimension scores come from
`teaser.dimensionScores`, then `report.dimensionScores`. Teaser scores are always
available on completed public pages, so the OG image does not require email unlock.

## Out of scope

- Site favicons / third-party company logos (audits only store `domainKey`)
- Overall score on the OG card (request is the four dimension scores)
