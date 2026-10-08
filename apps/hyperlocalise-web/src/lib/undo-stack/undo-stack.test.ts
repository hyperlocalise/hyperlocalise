/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  createUndoStackReducer,
  createUndoStackState,
  nextRedoStep,
  nextUndoStep,
  type UndoStackAction,
  type UndoStackState,
} from "./undo-stack";

type Doc = { name: string; count: number };
type Change = { field: keyof Doc | null };

const reducer = createUndoStackReducer<Doc, Change>({
  isEqual: (a, b) => a.name === b.name && a.count === b.count,
  describe: (before, after) => ({
    field: before.name !== after.name ? "name" : before.count !== after.count ? "count" : null,
  }),
  coalesceKeyOf: (change) => (change.field === "name" ? "text:name" : undefined),
  coalesceWindowMs: 1000,
  limit: 3,
});

const start: Doc = { name: "", count: 0 };

function run(
  actions: UndoStackAction<Doc, Change>[],
  initial: UndoStackState<Doc, Change> = createUndoStackState(start),
) {
  return actions.reduce(reducer, initial);
}

describe("undo-stack reducer", () => {
  it("records a step that holds both snapshots", () => {
    const state = run([{ type: "record", next: { name: "a", count: 0 }, at: 0 }]);

    expect(state.present).toEqual({ name: "a", count: 0 });
    expect(state.past).toHaveLength(1);
    expect(state.past[0]).toMatchObject({
      id: 1,
      origin: "user",
      before: start,
      after: { name: "a", count: 0 },
      description: { field: "name" },
      coalesceKey: "text:name",
      sealed: false,
    });
    expect(state.future).toEqual([]);
  });

  it("returns the same state when the next document equals the present", () => {
    const initial = createUndoStackState<Doc, Change>(start);
    const state = reducer(initial, { type: "record", next: { ...start }, at: 0 });

    expect(state).toBe(initial);
  });

  it("merges a burst of typing into one step, keeping the first before and the latest after", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0 },
      { type: "record", next: { name: "ab", count: 0 }, at: 300 },
      { type: "record", next: { name: "abc", count: 0 }, at: 900 },
    ]);

    expect(state.past).toHaveLength(1);
    expect(state.past[0]).toMatchObject({
      before: start,
      after: { name: "abc", count: 0 },
      createdAt: 0,
      updatedAt: 900,
    });
  });

  it("starts a new step once the window since the last keystroke has passed", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0 },
      { type: "record", next: { name: "ab", count: 0 }, at: 1001 },
    ]);

    expect(state.past).toHaveLength(2);
  });

  it("does not merge into a sealed step", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0 },
      { type: "seal" },
      { type: "record", next: { name: "ab", count: 0 }, at: 100 },
    ]);

    expect(state.past).toHaveLength(2);
    expect(state.past[0]?.sealed).toBe(true);
  });

  it("does not merge changes with different keys or without a key", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0 },
      { type: "record", next: { name: "a", count: 1 }, at: 100 },
      { type: "record", next: { name: "a", count: 2 }, at: 200 },
    ]);

    expect(state.past).toHaveLength(3);
  });

  it("does not merge steps that are not the person's own", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0, origin: "assistant" },
      { type: "record", next: { name: "ab", count: 0 }, at: 100 },
      { type: "record", next: { name: "abc", count: 0 }, at: 200, origin: "assistant" },
    ]);

    expect(state.past.map((step) => step.origin)).toEqual(["assistant", "user", "assistant"]);
  });

  it("drops a step whose typing ends where it began", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0 },
      { type: "record", next: { name: "", count: 0 }, at: 100 },
    ]);

    expect(state.past).toEqual([]);
    expect(state.present).toEqual(start);
  });

  it("uses an explicit description instead of describing the change itself", () => {
    const state = run([
      {
        type: "record",
        next: { name: "a", count: 0 },
        at: 0,
        origin: "system",
        description: { field: null },
      },
    ]);

    expect(state.past[0]).toMatchObject({ origin: "system", description: { field: null } });
    expect(state.past[0]?.coalesceKey).toBeUndefined();
  });

  it("undoes and redoes, sealing the step on the way", () => {
    const recorded = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0 },
      { type: "record", next: { name: "a", count: 1 }, at: 100 },
    ]);

    const undone = reducer(recorded, { type: "undo" });
    expect(undone.present).toEqual({ name: "a", count: 0 });
    expect(undone.past).toHaveLength(1);
    expect(nextRedoStep(undone)).toMatchObject({ after: { name: "a", count: 1 }, sealed: true });

    const redone = reducer(undone, { type: "redo" });
    expect(redone.present).toEqual({ name: "a", count: 1 });
    expect(redone.future).toEqual([]);
    expect(nextUndoStep(redone)?.id).toBe(2);
  });

  it("does nothing on undo or redo when there is nothing to apply", () => {
    const initial = createUndoStackState<Doc, Change>(start);

    expect(reducer(initial, { type: "undo" })).toBe(initial);
    expect(reducer(initial, { type: "redo" })).toBe(initial);
  });

  it("forgets the redo steps when a new change is recorded", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 0 }, at: 0 },
      { type: "undo" },
      { type: "record", next: { name: "a", count: 5 }, at: 2000 },
    ]);

    expect(state.future).toEqual([]);
    expect(state.past).toHaveLength(1);
    expect(state.past[0]?.after).toEqual({ name: "a", count: 5 });
  });

  it("keeps only the newest steps up to the limit", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 1 }, at: 0 },
      { type: "record", next: { name: "a", count: 2 }, at: 100 },
      { type: "record", next: { name: "a", count: 3 }, at: 200 },
      { type: "record", next: { name: "a", count: 4 }, at: 300 },
    ]);

    expect(state.past.map((step) => step.after.count)).toEqual([2, 3, 4]);
  });

  it("replaces the document without a step and resets by forgetting every step", () => {
    const recorded = run([{ type: "record", next: { name: "a", count: 0 }, at: 0 }]);

    const replaced = reducer(recorded, { type: "replace", present: { name: "z", count: 9 } });
    expect(replaced.present).toEqual({ name: "z", count: 9 });
    expect(replaced.past).toHaveLength(1);

    const reset = reducer(replaced, { type: "reset", present: start });
    expect(reset).toEqual(createUndoStackState(start));
  });

  it("gives each new step a fresh id, even after a reset of the counter", () => {
    const state = run([
      { type: "record", next: { name: "a", count: 1 }, at: 0 },
      { type: "record", next: { name: "a", count: 2 }, at: 100 },
      { type: "undo" },
      { type: "record", next: { name: "a", count: 3 }, at: 200 },
    ]);

    expect(state.past.map((step) => step.id)).toEqual([1, 3]);
  });
});
