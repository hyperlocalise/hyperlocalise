# Homepage FAQ and structured data

## Goal

Answer common product-evaluation questions on the homepage and expose the same answers as Schema.org `FAQPage` structured data.

## Design

Add a restrained FAQ section between the feature overview and final call to action. The section uses the existing accessible accordion primitive, starts with every item collapsed, and follows the homepage's established typography, borders, spacing, light theme, and dark theme.

Keep the twelve approved question-and-answer pairs in one typed message collection. The client-rendered accordion formats those messages for the active locale. The homepage Server Component formats the same descriptors to build localized `Question` and `Answer` entities for JSON-LD. This keeps visible content and structured data aligned without duplicating English copy.

## Accessibility and SEO

- Use the existing Base UI accordion for keyboard and focus behavior.
- Associate the section heading with the section through `aria-labelledby`.
- Render every answer in the server response even when visually collapsed.
- Emit one `FAQPage` JSON-LD script beside the existing `WebApplication` script.
- Escape structured data through the shared `JsonLd` component.

## Verification

- Run `vp check --fix` and `vp test`.
- Open the localized homepage in a browser at desktop and mobile widths.
- Confirm all questions start collapsed, expand from keyboard and pointer input, and remain readable in light and dark themes.
- Inspect the rendered JSON-LD and verify all visible questions and answers match the `FAQPage` entities.
