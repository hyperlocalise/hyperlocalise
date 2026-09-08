# Agent Automation visual workflow playground

Approved direction for `/product/agents-automation`: keep the agent walkthrough, add an interactive Visual Workflow playground, and rewrite How it works in plain language around multilingual content operations.

## Page order

1. Hero
2. Use-case demo
3. How it works
4. How to create an agent (unchanged mock)
5. Visual Workflow playground (new)
6. Request a demo

## How it works

Headline: **Build it once. Every language follows it.**

The section explains creating an automated workflow for multilingual content, not restating the hero pain and not using “agent,” “audit,” or “route.” Three steps:

1. Create the workflow — where work starts, then write, translate, check, publish.
2. It runs in every language — a person only looks if something is off.
3. It lands back in your tools — Contentful, Webflow, Slack, Intercom, Crowdin, Lokalise, Phrase, Smartling.

A logo row under the steps names Slack, Notion, Canva, Contentful, Webflow, GitHub, GitLab, Jira, Linear, Intercom, Crowdin, Lokalise, Phrase, Smartling, Ahrefs, Semrush, and Resend. “Explore the rest” stays below that row, not mixed into the steps.

Bottom CTA headline: **Set up the workflow. Watch the next campaign follow it.**

## Visual Workflow playground

Dynamically load the real `VisualWorkflowEditor` with `ssr: false`, `playgroundMode`, and no save handler. Visitors can add nodes, edit, connect, and run a simulated test. Refresh restores the seed graph. Nothing hits the backend.

Seed graph name: **Publish campaign pages**

1. Source upload — Campaign brief uploaded
2. AI agent — Draft the landing page
3. AI agent — Localise for FR, DE, JA
4. If / else — Check passed?
5. True → HTTP publish to Contentful
6. False → Slack `#gtm` for review

Load sample on this canvas must restore this campaign graph, not the in-app “Lead ping” sample.

## Verification

- Fixture coverage for the campaign graph shape and a successful playground test run.
- Marketing copy coverage for How it works and the playground intro.
- Confirm the editor loads with `ssr: false`.
- Run `vp test` and `vp check --fix` in `apps/hyperlocalise-web`.
- Browser-check add, edit, and test on the product page.
