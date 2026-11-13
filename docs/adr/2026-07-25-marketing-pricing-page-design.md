# Marketing pricing page

## Goal

Publish a public pricing page that shows Free, Starter, Growth, and Enterprise tiers before self-serve signup is available, and answer common pricing questions with the same FAQ pattern as the homepage.

## Design

Add `/[lang]/pricing` under the marketing layout. The page has five sections in order: a short headline, a four-column plan grid, a feature comparison matrix, an AI features explainer, and a pricing FAQ that reuses `HomepageFaqSection`.

Plan cards follow a Vercel-style column layout with thin vertical dividers. Free, Starter, and Growth use a disabled **Coming soon** CTA. Enterprise links to the existing demo calendar URL with **Get a demo**. Growth is marked Popular.

Plan limits match the Autumn product configuration:

- Free: 1 project, 1 seat
- Starter: $20/mo — 2 integrations, unlimited projects, 5 seats, AI features, Queries Board, 2,000,000 AI tokens / month, then $8 / 1M token overage
- Growth: $2,000/mo — 20 automations, 5 integrations, unlimited projects and seats, 2,000 agent runs / month, unlimited translation jobs, AI features, Automation Workflow, Queries Board, 2,000,000 AI tokens / month, then $4 / 1M token overage
- Enterprise: Custom — Growth features plus SSO, SLA, dedicated support, and custom limits

The comparison matrix repeats those limits in categorized rows. Its plan-name header stays sticky under the marketing navbar (`top-16`) while the matrix scrolls. There is no feature search.

A **Queries & automation** section elaborates Queries Board (workspace/project views, collaboration, import) and Automation Workflow (visual editor, step types, runs) with short row details under each label.

Between the matrix and FAQ, an AI features explainer lists the eight agent capabilities included on Growth and Enterprise as a simple title-plus-description list (no cards).

Pricing FAQ items live in a dedicated content module and use the homepage FAQ accordion and FAQPage JSON-LD helpers so visible copy and structured data stay aligned.

## Navigation

Add a Pricing link in the marketing Resources menu and footer Resources column.

## Verification

- Run `vp check --fix` and `vp test` in `apps/hyperlocalise-web`.
- Open `/en/pricing` at desktop and mobile widths.
- Confirm Coming soon controls are not actionable, Enterprise opens the demo URL, the matrix header sticks under the navbar, and FAQ items expand.
