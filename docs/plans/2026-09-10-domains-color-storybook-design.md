# Domains color and Storybook

Approved direction: the existing seafoam mesh image (`/images/mesh/mesh-gradient-1784864145512.jpg`) behind domain headers. Use a theme-aware scrim for readable text in light and dark mode. Keep data surfaces opaque, strengthen metric typography, and use blue feature icons and hover accents. Verification keeps its semantic badges.

Reuse the existing Storybook configuration. Cover the domains list and all five research views through the production shell, with pending verification, missing domain, empty ranks, Japanese content, and controlled link/verification dialogs. Use existing prototype fixtures; no live services are required. Use Storybook theme and viewport controls instead of separate dark and mobile variants.

Validation: vp check --fix, vp test, Storybook build, and visual inspection of representative stories using desktop/mobile viewports and light/dark themes.

## Consolidated overview and trends

Merge the Home metrics and Overview tables into the default Overview page. Navigation is Overview, Keyword research, Rank tracking, AI visibility, Prompt explorer. Redirect the legacy overview URL to the domain root while preserving locale. Remove redundant feature-navigation cards.

Each summary metric shows a seven-day sparkline and a first-to-last change with a colored direction icon and text. Zero baselines use absolute changes; missing history is distinct from zero movement. Use fixed, explicitly labeled sample observations for the prototype. Storybook covers rising, falling, unchanged, missing history, and zero baselines through controls rather than theme or viewport variants.
