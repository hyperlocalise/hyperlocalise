# Automation power shortcuts

The workspace automation editor and the visual workflow editor share one shortcut set and one hold-to-reveal pattern.

## Decision

Register the chords with `react-hotkeys-hook`, the same library as undo. Show the matching keys under each action only while **Alt** or **Option** is held, so the resting chrome stays quiet. **?** opens the same list in a dialog. A **Hold Alt** chip points at the reveal key.

Save (`mod+s`) and the primary action (`mod+enter`: run, create, or test) work inside fields. Unmodified keys (`n`, `f`, `?`) do not. A dialog or sheet keeps the page shortcuts off, so a modal field keeps the browser's own keys.

The assistant toggle (`mod+/`) is bound on the assistant button, because only that control sits inside the assistant provider.

## Alternatives

A always-visible hint bar, like the content editor, would crowd the automation header. Revealing only while the action's own modifier is held (TanStack's default) would hide `N` and `F`. A new hotkey library was not needed.
