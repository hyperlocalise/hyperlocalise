# Replace Hugeicons with Phosphor

The web app used Hugeicons (`@hugeicons/react` plus `@hugeicons/core-free-icons`) in a few hundred files. We replace that set with `@phosphor-icons/react`.

## Decisions

- Import Phosphor’s preferred `*Icon` names (`CubeIcon`, not `Cube`).
- Use Regular weight. That is Phosphor’s default, so omit `weight` except for fill states such as a checked box or a selected star.
- Render Phosphor components in place. Drop the `HugeiconsIcon` wrapper and `strokeWidth`.
- Import from `@phosphor-icons/react/ssr` in Server Components. Client files import from `@phosphor-icons/react`.
- Keep issue-sheet column IDs (`tag`, `calendar`, …). Only the renderer changes.
- Keep `simple-icons` for brand logos.
- Point `components.json` `iconLibrary` at Phosphor and remove the Hugeicons packages.

## Mapping

Hugeicons names do not match Phosphor one-for-one. Each used Hugeicons export maps to the closest Phosphor icon (`Add01Icon` → `PlusIcon`, `SearchIcon` → `MagnifyingGlassIcon`). Stored config values that used to hold Hugeicons path data now hold Phosphor components.

## Validation

`vp test` and `vp check --fix` in `apps/hyperlocalise-web` must pass, and no Hugeicons imports should remain.
