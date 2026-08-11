# Marketing company page

## Goal

Publish a public Company page that introduces Hyperlocalise’s mission, Startmate backing, and founders, and place it as a top-level marketing nav item beside Pricing.

## Design

Add `/[lang]/company` under the marketing layout. The page follows a Forward-inspired structure adapted to Hyperlocalise tokens:

1. Hero with mission headline and short supporting copy
2. Backed by Startmate
3. A note from the founders (two-column layout)
4. Founder cards with initials avatars and LinkedIn links for Minh Cung and Hans Bui

Rename the Resources mega-menu column currently labeled Company to Legal so top-level Company does not collide with Contact, Trust Center, Privacy, and Terms.

Register `/company` in the locale proxy allowlist and sitemap. Metadata and Open Graph follow the Pricing route pattern.

## Verification

- Run `vp lint` and targeted tests for proxy/sitemap changes.
- Open `/en/company` and confirm nav order Product → Resources → Pricing → Company.
- Confirm founder LinkedIn links and Startmate link open correctly.
