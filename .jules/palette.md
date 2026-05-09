## 2025-05-22 - [Tooltip and DropdownMenu Nesting]
**Learning:** In this project's UI system (based on Base UI), combining a `Tooltip` and `DropdownMenu` on the same trigger requires specific nesting to avoid event conflicts. Nesting the `Tooltip` inside the `DropdownMenu` and wrapping the `DropdownMenuTrigger` with `TooltipTrigger` ensures the tooltip doesn't stay open when the menu is active and avoids event propagation issues.
**Action:** Use the pattern `<DropdownMenu><Tooltip><TooltipTrigger render={<DropdownMenuTrigger ... />}>...</TooltipTrigger>...</Tooltip>...</DropdownMenu>` when adding tooltips to menu triggers.

## 2025-05-24 - [Keyboard Shortcut Hints in Tooltips]
**Learning:** Tooltips for icon-only buttons that have keyboard shortcuts should include the shortcut hint using the `Kbd` component. This improves discoverability for power users. Simple OS detection (Mac vs Others) should be used to show the correct modifier key (⌘ vs Ctrl).
**Action:** Add `<Kbd className="ms-2">{isMac ? "⌘B" : "Ctrl+B"}</Kbd>` inside `TooltipContent` for actions with shortcuts.
