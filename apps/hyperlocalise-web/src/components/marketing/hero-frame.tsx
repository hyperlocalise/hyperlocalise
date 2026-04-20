"use client";

import { DotFlow, DotMatrix } from "dot-anime-react";
import { motion, useReducedMotion } from "motion/react";

const DIMENSION = 45;
const ROWS = Math.max(1, Math.floor(DIMENSION / 4));
const GAME_OF_LIFE_FRAMES = 512;
const INITIAL_DENSITY = 0.34;
const RANDOM_SEED = 0x51f15e;

type Cell = readonly [row: number, col: number];

function toIndex(row: number, col: number, cols: number) {
  return row * cols + col;
}

function toCell(index: number, cols: number): Cell {
  return [Math.floor(index / cols), index % cols];
}

function getNeighborCount(
  row: number,
  col: number,
  liveCells: ReadonlySet<number>,
  cols: number,
  rows: number,
) {
  let neighbors = 0;

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;

      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
        continue;
      }

      if (liveCells.has(toIndex(nextRow, nextCol, cols))) {
        neighbors += 1;
      }
    }
  }

  return neighbors;
}

function createRandomNumberGenerator(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function createChaoticSeed(cols: number, rows: number, random: () => number) {
  const liveCells = new Set<number>();
  const bandTop = Math.max(0, Math.floor(rows * 0.125));
  const bandBottom = Math.min(rows, Math.ceil(rows * 0.875));
  const bandLeft = Math.max(0, Math.floor(cols * 0.1));
  const bandRight = Math.min(cols, Math.ceil(cols * 0.9));

  for (let row = bandTop; row < bandBottom; row += 1) {
    for (let col = bandLeft; col < bandRight; col += 1) {
      if (random() < INITIAL_DENSITY) {
        liveCells.add(toIndex(row, col, cols));
      }
    }
  }

  if (liveCells.size === 0) {
    liveCells.add(toIndex(Math.floor(rows / 2), Math.floor(cols / 2), cols));
  }

  return liveCells;
}

function injectRandomDot(
  liveCells: ReadonlySet<number>,
  cols: number,
  rows: number,
  random: () => number,
) {
  const availableCells: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = toIndex(row, col, cols);

      if (!liveCells.has(index)) {
        availableCells.push(index);
      }
    }
  }

  if (availableCells.length === 0) {
    return new Set(liveCells);
  }

  const injectedCells = new Set(liveCells);
  const randomIndex = Math.floor(random() * availableCells.length);
  injectedCells.add(availableCells[randomIndex]);

  return injectedCells;
}

function nextGeneration(liveCells: ReadonlySet<number>, cols: number, rows: number) {
  const nextCells = new Set<number>();
  const candidates = new Set<number>();

  for (const index of liveCells) {
    const [row, col] = toCell(index, cols);

    candidates.add(index);

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        const nextRow = row + rowOffset;
        const nextCol = col + colOffset;

        if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
          continue;
        }

        candidates.add(toIndex(nextRow, nextCol, cols));
      }
    }
  }

  for (const index of candidates) {
    const [row, col] = toCell(index, cols);
    const neighbors = getNeighborCount(row, col, liveCells, cols, rows);
    const isAlive = liveCells.has(index);

    if (neighbors === 3 || (isAlive && neighbors === 2)) {
      nextCells.add(index);
    }
  }

  return nextCells;
}

function generateGameOfLifeSequence(dimension: number) {
  const cols = dimension;
  const rows = ROWS;
  const frames: number[][] = [];
  const random = createRandomNumberGenerator(RANDOM_SEED + dimension);
  const seenFrames = new Set<string>();
  let liveCells = createChaoticSeed(cols, rows, random);

  for (let frame = 0; frame < GAME_OF_LIFE_FRAMES; frame += 1) {
    const currentFrame = [...liveCells].sort((left, right) => left - right);
    const currentKey = currentFrame.join(",");

    frames.push(currentFrame);
    seenFrames.add(currentKey);

    const nextCells = nextGeneration(liveCells, cols, rows);
    const nextFrame = [...nextCells].sort((left, right) => left - right);
    const nextKey = nextFrame.join(",");

    liveCells =
      nextKey === currentKey || seenFrames.has(nextKey)
        ? injectRandomDot(nextCells, cols, rows, random)
        : nextCells;
  }

  return frames;
}

const abstractSequences = generateGameOfLifeSequence(DIMENSION);

const flipDotItems = [
  {
    title: "Connecting to Github",
    frames: [
      [0, 4, 7, 8, 10, 11, 15],
      [0, 4, 5, 7, 8, 11, 15],
      [4, 5, 7, 8, 11, 12, 15],
      [3, 4, 5, 7, 8, 11, 12],
      [2, 3, 4, 7, 8, 11, 12],
      [3, 4, 7, 8, 11, 12, 13],
      [4, 7, 8, 11, 12, 13, 15],
      [4, 7, 8, 10, 11, 12, 15],
    ],
  },
  {
    title: "Gathering cultural context",
    frames: [
      [0, 4, 7, 8, 10, 11, 15],
      [0, 4, 5, 7, 8, 11, 15],
      [4, 5, 7, 8, 11, 12, 15],
      [3, 4, 5, 7, 8, 11, 12],
      [2, 3, 4, 7, 8, 11, 12],
      [3, 4, 7, 8, 11, 12, 13],
      [4, 7, 8, 11, 12, 13, 15],
      [4, 7, 8, 10, 11, 12, 15],
    ],
  },
  {
    title: "Thinking",
    frames: [
      [0, 4, 7, 8, 10, 11, 15],
      [0, 4, 5, 7, 8, 11, 15],
      [4, 5, 7, 8, 11, 12, 15],
      [3, 4, 5, 7, 8, 11, 12],
      [2, 3, 4, 7, 8, 11, 12],
      [3, 4, 7, 8, 11, 12, 13],
      [4, 7, 8, 11, 12, 13, 15],
      [4, 7, 8, 10, 11, 12, 15],
    ],
  },
  {
    title: "Translating 30 strings",
    frames: [
      [0, 4, 7, 8, 10, 11, 15],
      [0, 4, 5, 7, 8, 11, 15],
      [4, 5, 7, 8, 11, 12, 15],
      [3, 4, 5, 7, 8, 11, 12],
      [2, 3, 4, 7, 8, 11, 12],
      [3, 4, 7, 8, 11, 12, 13],
      [4, 7, 8, 11, 12, 13, 15],
      [4, 7, 8, 10, 11, 12, 15],
    ],
  },
  {
    title: "Evaluating OpenAI",
    frames: [
      [0, 4, 7, 8, 10, 11, 15],
      [0, 4, 5, 7, 8, 11, 15],
      [4, 5, 7, 8, 11, 12, 15],
      [3, 4, 5, 7, 8, 11, 12],
      [2, 3, 4, 7, 8, 11, 12],
      [3, 4, 7, 8, 11, 12, 13],
      [4, 7, 8, 11, 12, 13, 15],
      [4, 7, 8, 10, 11, 12, 15],
    ],
  },
];

export function HeroFrame() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className=" overflow-hidden text-center mx-auto p-4.5 space-y-1.5"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.72,
        ease: [0.19, 1, 0.22, 1],
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-[20%] top-[16%] h-[56%] w-[56%] rounded-full blur-3xl"
        initial={shouldReduceMotion ? false : { opacity: 0, x: -40 }}
        animate={shouldReduceMotion ? { opacity: 0.45 } : { opacity: 0.45, x: 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 1.1,
          delay: shouldReduceMotion ? 0 : 0.3,
          ease: [0.19, 1, 0.22, 1],
        }}
      />

      <DotMatrix
        sequence={abstractSequences}
        cols={DIMENSION}
        rows={ROWS}
        dotSize={24}
        gap={11}
        shape="rounded"
        interval={120}
        color="var(--color-neutral)"
        inactiveColor="color-mix(in srgb, var(--color-neutral) 18%, transparent)"
        activeDotStyle={{
          boxShadow: "0 0 8px color-mix(in srgb, var(--color-neutral) 20%, transparent)",
        }}
      />

      <DotFlow
        items={flipDotItems}
        direction="horizontal"
        spacing={12}
        autoPlay={4000}
        matrix={{
          interval: 180,
          cols: 4,
          rows: 4,
          dotSize: 4,
          gap: 1,
          color: "#ff8dd0",
          inactiveColor: "rgba(244, 114, 182, 0.1)",
        }}
      />
    </motion.div>
  );
}
