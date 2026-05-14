## 2026-05-12 - [Project Form Accessibility & Feedback]
**Learning:** In `apps/hyperlocalise-web`, the semantic form field pattern (using `Field`, `FieldLabel`, `FieldError`) should be consistently applied to replace basic `<label>` tags. This pattern improves layout consistency and provides a standard hook for accessibility features like `aria-describedby` for character counters.
**Action:** Always use the `Field` component family for complex forms and ensure supplementary information like character counts are explicitly linked to inputs via unique IDs and ARIA attributes.

## 2026-05-13 - [Accessible Icon Buttons with Dynamic Feedback]
**Learning:** For icon-only buttons that trigger an action (like copying text), providing dynamic feedback in both the tooltip and `aria-label` (e.g., changing from "Copy" to "Copied!") is essential for a great UX. When using `@base-ui/react` tooltips, use the `render` prop on `TooltipTrigger` to avoid rendering a nested `<button>` inside a `<button>`, which is invalid HTML and breaks screen reader behavior.
**Action:** Always use `<TooltipTrigger render={<Button ... />}>` for accessible icon buttons and synchronize the dynamic feedback between the tooltip content and the button's `aria-label`.
