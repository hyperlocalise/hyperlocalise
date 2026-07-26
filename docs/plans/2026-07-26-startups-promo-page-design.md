# Hyperlocalise for Startups page

## Problem

Early-stage startups need a clear path to discounted Hyperlocalise Growth
pricing. The site had no dedicated Startup Program surface; discount
fulfillment is demo-led and manual.

## Decision

Ship an offer-first marketing page at `/startups`, inspired by Linear’s
Startup Program layout.

- **Flow:** Request a Demo applies for the program; no coupons or partner
  codes in this release.
- **Offer:** Up to 80% off Growth for early-stage startups (typically under
  50 employees or pre-Series B), for the first 12 months or while they
  qualify. Exact terms confirmed on the demo.
- **Proof:** Only verified traction — Heidi Health, Tourfinder, Tourmatic;
  Tourfinder days-not-months result; Startmate; Slator 2026 Language AI 50
  Under 50.
- **IA:** Dedicated route (not a pricing subsection). Footer Resources and
  navbar Resources link to Startups. Public locale path allowlisted in
  proxy; included in the sitemap.

## Page sections

1. Full-bleed hero — brand, headline, offer line, apply + see pricing CTAs
2. Why startups — three benefits (launch speed, keep TMS, context review)
3. Proof — logos, Tourfinder line, Startmate + Slator recognition
4. Program box — eligibility + apply CTA
5. FAQ — program, eligibility, apply, discount meaning, larger companies
6. Final CTA — repeat apply

## Out of scope

Autumn coupons, partner portals, fabricated traction metrics, and self-serve
checkout changes.
