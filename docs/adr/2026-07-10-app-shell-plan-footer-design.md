# App shell plan footer

## Goal

Simplify the app shell's billing summary and keep support easy to reach without taking space from the main navigation.

## Design

A fixed footer spans the full viewport below the sidebar and main content. The footer uses the existing app-shell surfaces and border tokens so it remains calm in light and dark themes.

The left side contains a compact plan pill with a plan icon and the active plan name. Selecting it opens an accessible dialog with the current plan, renewal details, primary usage meter, and links to usage and available plans on the billing settings page. Loading, unavailable, and no-plan states stay inside the same surface.

The right side contains a Support icon button. It opens the user's email client with `mailto:minh@hyperlocalise.com`.

The app shell uses one shared footer-height token for the footer, sidebar scroll padding, and main content padding. The token includes the device safe area so the footer never covers navigation or page content. The footer remains independent of the sidebar's expanded or collapsed state.

## Data and permissions

The plan pill reuses the existing Autumn customer and plan queries. It appears only when the user can read billing and Autumn is configured. The support action remains available to every authenticated user.

## Accessibility

The plan pill has a visible label and uses the existing dialog primitive for keyboard focus and dismissal. The icon-only Support button has an accessible name and tooltip. Usage values use tabular numerals, and the dialog exposes a title and description.

## Verification

Add focused component coverage for the plan footer states and actions. Run the affected tests and `vp check --fix` from `apps/hyperlocalise-web`.
