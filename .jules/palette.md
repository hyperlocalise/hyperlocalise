## 2026-05-12 - [Project Form Accessibility & Feedback]
**Learning:** In `apps/hyperlocalise-web`, the semantic form field pattern (using `Field`, `FieldLabel`, `FieldError`) should be consistently applied to replace basic `<label>` tags. This pattern improves layout consistency and provides a standard hook for accessibility features like `aria-describedby` for character counters.
**Action:** Always use the `Field` component family for complex forms and ensure supplementary information like character counts are explicitly linked to inputs via unique IDs and ARIA attributes.

## 2026-05-13 - [Accessible Icon Buttons with Dynamic Feedback]
**Learning:** For icon-only buttons that trigger an action (like copying text), providing dynamic feedback in both the tooltip and `aria-label` (e.g., changing from "Copy" to "Copied!") is essential for a great UX. When using `@base-ui/react` tooltips, use the `render` prop on `TooltipTrigger` to avoid rendering a nested `<button>` inside a `<button>`, which is invalid HTML and breaks screen reader behavior.
**Action:** Always use `<TooltipTrigger render={<Button ... />}>` for accessible icon buttons and synchronize the dynamic feedback between the tooltip content and the button's `aria-label`.

## 2026-05-24 - [Tooltip Content and Prop Forwarding]
**Learning:** Tooltip content in this design system should avoid block-level typography components (like `TypographyP`) to prevent excessive line-height; plain text or inline elements are preferred for compact tooltips. Additionally, when using the `render` prop on `TooltipTrigger` for icon-only buttons, the icons and screen-reader only text must be nested *inside* the component being rendered (e.g., `<TooltipTrigger render={<Button>...</Button>} />`) to ensure proper event delegation and accessibility prop forwarding.
**Action:** Use plain text for tooltips and ensure all button children are placed inside the `render` prop's component when wrapping with a `TooltipTrigger`.
