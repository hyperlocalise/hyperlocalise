# Hero Subtle Reveal Design

## Context

The marketing hero in `apps/hyperlocalise-web` was static. The goal was to add a light entrance effect on initial page load without turning the hero into a constantly animated surface.

## Decision

Use a one-time staged reveal driven by Motion variants in the hero component:

- Headline enters first with opacity plus a short upward offset.
- Supporting copy follows with the same easing and a small delay.
- The hero frame enters last with a slightly longer duration and a restrained `scale(0.98)` to `scale(1)` settle.

## Rationale

- `ease-out` is the right motion profile for elements entering the screen.
- Motion keeps the sequence explicit in the component and makes reduced-motion handling straightforward.
- The animation only touches `opacity` and `transform`, which is the lowest-risk performance path.
- `prefers-reduced-motion` can disable the effect cleanly while preserving the final layout.

## Consequences

- The hero gains a more deliberate load sequence and clearer visual hierarchy.
- The motion remains subtle enough for a marketing surface that users may revisit.
- Future hero motion should stay one-shot unless there is a strong reason to add interaction-based animation.
