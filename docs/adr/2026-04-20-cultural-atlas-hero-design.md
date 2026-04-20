# Cultural Atlas Hero Design

## Summary

The homepage hero should replace the placeholder product frame with a high-end editorial poster treatment. The concept is a `Cultural Atlas`: real cities, real language markers, and short local phrase fragments arranged as a composed field rather than a literal product screenshot.

The goal is to make the first impression more distinctive while keeping the product legible. The visual carries the brand and the headline carries the explanation.

## Direction

- Use real place-language pairs instead of abstract multilingual noise.
- Keep the hero premium and editorial, not technical or dashboard-like.
- Make typography the primary visual device.
- Avoid literal world maps, flags, glossy 3D objects, or neon network effects.

## Content Rules

- Show 6 to 8 real cities on desktop.
- Reduce to 4 to 5 cities on mobile through cropping and hierarchy.
- Pair each city with plausible locale tags, district references, and short local phrase fragments.
- Keep phrases short and functional instead of using full translated sentences.

## UX Rules

- Use a direct headline so the abstract visual does not reduce clarity.
- Keep one primary CTA and one secondary action.
- Add a compact trust/support layer under the hero copy.
- Use restrained motion only: soft reveals, subtle drift, and route-line cues.

## Implementation Notes

- Update the hero copy in `apps/hyperlocalise-web/src/components/marketing/hero-section.tsx`.
- Replace the placeholder frame in `apps/hyperlocalise-web/src/components/marketing/hero-frame.tsx`.
- Keep the rest of the marketing page structure unchanged.
