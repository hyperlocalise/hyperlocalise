## 2026-05-12 - [Project Form Accessibility & Feedback]
**Learning:** In `apps/hyperlocalise-web`, the semantic form field pattern (using `Field`, `FieldLabel`, `FieldError`) should be consistently applied to replace basic `<label>` tags. This pattern improves layout consistency and provides a standard hook for accessibility features like `aria-describedby` for character counters.
**Action:** Always use the `Field` component family for complex forms and ensure supplementary information like character counts are explicitly linked to inputs via unique IDs and ARIA attributes.
