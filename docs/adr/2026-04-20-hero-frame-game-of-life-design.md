# Hero Frame Game of Life Design

## Goal

Replace the hard-coded `abstractSequences` frames in the marketing hero with a generated Game of Life animation derived from `DIMENSION`.

## Decision

Use a deterministic Game of Life variant that:

- derives `cols` from `DIMENSION`
- derives `rows` from `Math.floor(DIMENSION / 4)`
- seeds a dense starting field inside a centered band
- simulates a fixed number of generations
- monitors for short loops and low-population collapse
- reseeds the board with a deterministic multi-cell cluster when the system stabilizes
- converts each generation into the `number[]` frame format expected by `DotMatrix`

## Why This Approach

This keeps the animation reproducible, removes the brittle hard-coded indices, and makes the sequence scale with the configured matrix size. The hero keeps the recognizable Game of Life feel, but the deterministic reseeding step prevents the shallow grid from dying out or getting trapped in a tiny oscillator.

## Tradeoffs

- The animation is no longer a strict Conway run because it injects new structure when the board becomes too quiet.
- The helper is tuned for the hero's shallow matrix rather than being a general-purpose cellular automaton engine.

## Validation

Run the existing formatting, linting, and test commands for the repo and the web app.
