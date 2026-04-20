# Hero Frame Game of Life Design

## Goal

Replace the hard-coded `abstractSequences` frames in the marketing hero with a generated Game of Life animation derived from `DIMENSION`.

## Decision

Use a deterministic Conway's Game of Life generator that:

- derives `cols` from `DIMENSION`
- derives `rows` from `Math.floor(DIMENSION / 4)`
- seeds a centered glider pattern
- simulates a fixed number of generations
- converts each generation into the `number[]` frame format expected by `DotMatrix`

## Why This Approach

This keeps the animation reproducible, removes the brittle hard-coded indices, and makes the sequence scale with the configured matrix size. A glider is compact, recognizable, and fits the current shallow hero grid without additional heuristics.

## Tradeoffs

- A glider eventually exits a bounded grid, so the loop repeats after a finite run rather than evolving indefinitely.
- The helper is tailored to the hero's current dimensions instead of being a full pattern library.

## Validation

Run the existing formatting, linting, and test commands for the repo and the web app.
