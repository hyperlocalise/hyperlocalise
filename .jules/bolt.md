# Bolt's Journal - Critical Learnings Only

## 2024-05-24 - Initializing Bolt's Journal
**Learning:** Always keep a record of critical performance learnings to avoid repeating mistakes.
**Action:** Created this file to track future insights.

## 2025-05-15 - Redundant TooltipProvider Removal
**Learning:** Nested `TooltipProvider` instances in React components (like `Message`, `Artifact`, `WebPreview`) add unnecessary context overhead and can lead to desynced timers if the root already provides one. In this codebase, `apps/hyperlocalise-web/src/app/layout.tsx` provides a global `TooltipProvider`.
**Action:** Removed local `TooltipProvider` instances from `ai-elements` components to streamline the React tree and reduce memory/render overhead.
