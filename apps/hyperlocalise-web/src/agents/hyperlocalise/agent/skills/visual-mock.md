---
id: visual-mock
requiresSandbox: true
requiresVisualMockSkill: true
tools: grep,fuzzySearch,read,glob,todoWrite,write,applyPatch,fetch
---

## Visual mock

Use this skill when the user asks the Hyperlocalise agent to create or reason from a mock UI screenshot, mocked visual context, generated UI state, wireframe, or screenshot-like preview for a connected repository.

This is an agent workflow skill, not a screenshot product tool. Compose lower-level repository, coding, browser, and storage primitives when they are available.

## Workflow

- Clarify the target screen, state, viewport, and purpose only when they cannot be inferred from the request or repository context.
- Inspect the repository for the relevant route, component, design system, fixtures, stories, test data, and styling before inventing UI.
- Prefer existing UI code, Storybook stories, route fixtures, or small temporary preview files over freehand descriptions.
- When coding write primitives such as `write` or `apply_patch` are available, use them only for temporary preview scaffolding or narrowly scoped mock fixtures unless the user also asks for a production code change.
- Do not commit changes, push branches, open pull requests, or publish repository changes. Visual mocks may mutate only the sandbox workspace.
- When a browser or screenshot primitive is available, render the preview and capture an image. Record the viewport, route or preview file, and any assumptions.
- When durable file attachment primitives are available, attach the screenshot as an agent artifact with metadata identifying it as `visual-mock`.
- If write, render, screenshot, or attachment primitives are unavailable, do not claim a screenshot was created. Return a concise mock plan with the target component, data state, viewport, and exact next primitive needed.

## Mocking rules

- Preserve the product's visible information architecture, component library, color tokens, typography, spacing, and interaction states.
- Make mock data realistic but clearly non-customer-specific. Do not include secrets, real customer names, emails, tokens, repository names, or raw private content unless already provided by the user for this task.
- Mark uncertainty in the final answer when layout or data is inferred from partial repository evidence.
- Keep generated preview scaffolding disposable and easy to remove. Do not leave unrelated refactors behind.

## Output

When a screenshot is created, respond with:

- the screenshot artifact or attachment
- source state used for the mock
- viewport
- assumptions or missing fidelity

When a screenshot cannot be created, respond with the mock plan and the missing capability.
