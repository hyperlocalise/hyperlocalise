# Localisation audit luxury report

## Goal

Make the public localisation audit result feel like a professional branded report: mesh cover, company identity, and the full findings visible without email unlock. Email stays optional for a summary delivery.

## Product

- Result pages always show the full report for succeeded audits.
- Email capture becomes “Email me a summary” (same Resend delivery path; no unlock gate).
- Cover always shows company profile when available: logo, product summary, brand voice, industry.
- Hero includes a share control next to score metadata.

## Company profile

```ts
type LocalisationAuditCompanyProfile = {
  name: string | null;
  logoUrl: string | null;
  productSummary: string | null;
  brandVoice: string | null;
  industry: string | null;
  confidence: number;
};
```

Built during analyze:

1. Crawl homepage signals: title, meta/OG description, headings, logo candidates (`link[rel~=icon]`, `apple-touch-icon`, `og:image`).
2. Luna profile pass from that evidence only (product, brand voice, industry, display name).
3. On Luna failure: heuristic name/product from title/meta; omit industry/voice; low confidence.

Persisted on both `teaser` and `report`. Legacy rows without profile render domain-only cover.

## UI

- Sage mesh hero cover: logo (or monogram), name/domain, industry chip, product + brand voice, score, dimension circles, share button.
- Body sections remain in report order; findings and criteria are always expanded (no locked teaser).
- Running/failed states keep current structure with a light mesh wash.

## API

- Succeeded GET returns full `report` and treats the page as public (`unlocked: true`).
- Unlock POST still queues the summary email; UI copy no longer describes unlock.

## Testing

- Logo picker and profile schema unit tests.
- Route tests assert public report on succeeded audits.
- Storybook/fixture updates for cover with and without profile.
