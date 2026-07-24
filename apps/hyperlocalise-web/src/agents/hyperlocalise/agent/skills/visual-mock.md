---
id: visual-mock
requiresSandbox: true
requiresVisualMockSkill: true
tools: grep,fuzzySearch,read,glob,todoWrite,write,applyPatch,captureScreenshot,fetch
---

## Visual mock

Use this skill when the user asks for visual context, a mock UI screenshot, mocked visual context, generated UI state, wireframe, or screenshot-like preview for a connected repository — including phrasing like "visual context for …", "show me the UI for …", or "screenshot of …".

This is an agent workflow skill, not a screenshot product tool. Compose lower-level repository, coding, browser, and storage primitives when they are available. Prefer a Storybook/`captureScreenshot` image over a text-only answer when this skill and `captureScreenshot` are available. Still include the find-context textual sections beside the image — do not replace translator context with capture metadata.

## Workflow

- Clarify the target screen, state, viewport, and purpose only when they cannot be inferred from the request or repository context.
- Before repository inspection, call `todoWrite` with this workflow checklist and keep it updated after each milestone:
  1. `Find the target component and an existing Storybook story` — `in-progress`
  2. `Prepare a representative preview state` — `todo`
  3. `Capture and verify the screenshot` — `todo`
- Keep exactly one checklist item `in-progress`. When no suitable story exists, mark the first item `completed` and change the second item to `No story found — create a temporary Storybook story with mock data` before using `write` or `applyPatch`. After the preview renders, mark that item `completed` and the capture item `in-progress`. Mark every item `completed` only after screenshot capture succeeds.
- Inspect the repository for the relevant route, component, design system, fixtures, stories, test data, and styling before inventing UI.
- Locate the component that renders the target string/key (usage site, parent screen, or leaf UI). Prefer capturing that component's UI over freehand descriptions.
- Prefer an **existing** Storybook story for that component when one already exists. Reuse nearby fixtures, test data, or story args when possible.
- **When the component has no Storybook story** and the workspace has Storybook (a `storybook` / `dev:storybook` / `storybook:dev` script or a `storybook` / `@storybook/*` dependency in `package.json`, including nested app packages):
  1. Use repository write tools (`write` / `applyPatch`) to create a temporary CSF story next to the component (or in the repo's usual stories location), following existing Storybook conventions in that package.
  2. Supply realistic mock props/args so the target string is visible in a representative state. Prefer fixtures and patterns from sibling stories or tests; invent only what is missing.
  3. Derive the Storybook `storyId` from the new story's `title` + export name (CSF id form, e.g. `components-button--primary`).
  4. Call `captureScreenshot` with that `storyId` and `waitForText` set to the visible strings that must appear in the mock (the source/target copy under review, button labels, headings). Exact substrings from the rendered UI work best.
  5. Keep the generated story disposable sandbox scaffolding unless the user also asked for a production Storybook addition.
- If Storybook is **not** present in the repo, do not invent a Storybook setup. Tell the user to add Storybook and implement visual regression testing with it so component screenshots can be captured for localization context. Include a short mock plan (target component, data state, viewport) and that Storybook is the missing capability. Do not claim a screenshot was created.
- When coding write primitives such as `write` or `applyPatch` are available, use them only for temporary preview scaffolding, missing Storybook stories for capture, or narrowly scoped mock fixtures unless the user also asks for a production code change.
- Do not commit changes, push branches, open pull requests, or publish repository changes. Visual mocks may mutate only the sandbox workspace.
- When a browser or screenshot primitive is available, render the preview and capture an image. Use viewport, story id, and mock state as capture inputs; do not dump them as the user-facing answer.
- Use `captureScreenshot` for Storybook stories. Provide the Storybook story id, viewport, and `waitForText` with the copy that should be visible before capture; do not ask for package-manager-specific commands. The tool discovers Storybook in the repo root or nested app packages and waits until those strings appear in the story DOM.
- If `captureScreenshot` fails, read the tool `errorCode`, `recoveryHint`, and error excerpt. Fix recoverable issues in the sandbox (Storybook story syntax/index errors, wrong `storyId`, missing mock props) and call `captureScreenshot` again once. Do not retry blindly when the failure is environmental (`browser_*`, `package_manager_unavailable`, `write_not_allowed`).
- When durable file attachment primitives are available, attach the screenshot as an agent artifact with metadata identifying it as `visual-mock`.
- If write, render, screenshot, or attachment primitives are unavailable, do not claim a screenshot was created. Return a concise mock plan (target component and next primitive needed) plus the find-context sections below when repository evidence supports them.

## Mocking rules

- Preserve the product's visible information architecture, component library, color tokens, typography, spacing, and interaction states.
- Make mock data realistic but clearly non-customer-specific. Do not include secrets, real customer names, emails, tokens, repository names, or raw private content unless already provided by the user for this task.
- Mark uncertainty in the final answer when layout or data is inferred from partial repository evidence.
- Keep generated preview scaffolding disposable and easy to remove. Do not leave unrelated refactors behind.

## Output

When a screenshot is created, respond with the screenshot artifact or attachment, then the same concise Markdown contract as `find-context`:

**What it is:** 1-3 sentences on what the string or key is and what it does in the product, including UI role, user-facing purpose, and any ICU placeholders or variables.

**Where/how it shows:** 1-4 sentences on the product surface and interaction: screen, step, flow, layout position, and how the user encounters it. Point at the screenshot for the visual placement; include the best repository evidence inline as concrete `path:line` references and quoted source text when helpful.

**Translation guidance:**

- Actionable notes for translators: intended meaning, tone/register, length constraints, and what to avoid.
- Call out sibling strings in the same feature that share a concept and should use consistent terminology. Name keys when repository evidence supports it.
- Note ambiguities, inferred layout/data, or missing fidelity in at most one short bullet.

Do **not** use separate "Source state", "Viewport", "Evidence", "Summary", "Answer", "Source", "Details", or "Searches Run" sections. Capture metadata (story id, viewport, mock args) belongs in tool inputs/outputs, not the translator-facing answer. Omit bullets that add no translation value.

When a screenshot cannot be created, always reply with what failed (include the Storybook/path error when present), the mock plan, and the missing capability or next fix — then still give the find-context sections above from repository evidence when enough context is available. Never finish silently after a failed capture. If Storybook is missing from the repo, explicitly recommend adding Storybook for visual regression testing so future visual-context requests can capture component screenshots.
