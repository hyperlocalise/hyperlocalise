# Provider Switching Illustration Design

## Context

The marketing chapter “Stay flexible across providers and platforms” needed a lightweight interactive illustration that explains portability without falling back to a static placeholder or a literal vendor diagram.

## Decision

Build a client-side React illustration with three zones:

- A selectable provider rail.
- A central Hyperlocalise core card that stays visually stable.
- A destination rail for downstream platforms.

The primary interaction is provider switching. Hovering or tapping a provider updates the active state, reorders the destination cards, and marks one secondary destination as rerouted to communicate fallback and workflow continuity.

## Rationale

- A central stable card communicates that the product workflow does not change when providers change.
- Reordering destination cards makes rerouting visible without adding a dense flowchart.
- Compact cards, chips, and route bars fit the existing marketing illustration language better than a bespoke SVG.
- Motion can stay subtle and limited to layout shifts, highlight changes, and a restrained route pulse.
- The component can remain a narrow `"use client"` boundary so the broader page stays server-rendered.

## Consequences

- The illustration tells a clear story on both desktop and mobile with a single interaction model.
- The component is easy to extend with more providers or destinations later.
- The experience depends on lightweight client-side state, but the JavaScript scope stays contained to one isolated marketing component.
