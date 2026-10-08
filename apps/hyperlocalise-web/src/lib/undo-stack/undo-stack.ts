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

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

/** Who made the change a step holds. */
export type UndoOrigin = "user" | "assistant" | "system";

/**
 * One undoable change to a document of type `T`, described in the host's own shape `D`. A step
 * holds whole snapshots: undo replaces the document with `before`, redo with `after`.
 */
export type UndoStep<T, D> = {
  id: number;
  origin: UndoOrigin;
  before: T;
  after: T;
  description: D;
  /** Steps with the same key, close in time, merge into one (a burst of typing). */
  coalesceKey?: string;
  createdAt: number;
  /** When the step was last merged into; the coalescing window is measured from here. */
  updatedAt: number;
  /** A sealed step never merges again. */
  sealed: boolean;
};

export type UndoStackState<T, D> = {
  present: T;
  /** The last entry is the next step to undo. */
  past: UndoStep<T, D>[];
  /** The last entry is the next step to redo. */
  future: UndoStep<T, D>[];
  nextId: number;
};

export type UndoStackOptions<T, D> = {
  isEqual: (a: T, b: T) => boolean;
  /** Describes a change for the UI and for coalescing; called on each record and merge. */
  describe: (before: T, after: T) => D;
  coalesceKeyOf?: (description: D) => string | undefined;
  coalesceWindowMs?: number;
  /** How many past steps are kept; the oldest go first. */
  limit?: number;
};

export type UndoStackAction<T, D> =
  | {
      type: "record";
      next: T;
      /** The time of the change, passed in so the reducer stays pure. */
      at: number;
      origin?: UndoOrigin;
      /** Replaces what `describe` would say, for changes the host names itself. */
      description?: D;
    }
  | { type: "seal" }
  | { type: "undo" }
  | { type: "redo" }
  /** Sets the document without a step. */
  | { type: "replace"; present: T }
  /** Sets the document and forgets every step. */
  | { type: "reset"; present: T };

export const UNDO_COALESCE_WINDOW_MS = 1000;
export const UNDO_STACK_LIMIT = 100;

export function createUndoStackState<T, D>(present: T): UndoStackState<T, D> {
  return { present, past: [], future: [], nextId: 1 };
}

export function nextUndoStep<T, D>(state: UndoStackState<T, D>): UndoStep<T, D> | null {
  return state.past.at(-1) ?? null;
}

export function nextRedoStep<T, D>(state: UndoStackState<T, D>): UndoStep<T, D> | null {
  return state.future.at(-1) ?? null;
}

export function createUndoStackReducer<T, D>(options: UndoStackOptions<T, D>) {
  const window = options.coalesceWindowMs ?? UNDO_COALESCE_WINDOW_MS;
  const limit = options.limit ?? UNDO_STACK_LIMIT;

  function record(
    state: UndoStackState<T, D>,
    action: Extract<UndoStackAction<T, D>, { type: "record" }>,
  ): UndoStackState<T, D> {
    if (options.isEqual(state.present, action.next)) {
      return state;
    }
    const origin = action.origin ?? "user";
    const description = action.description ?? options.describe(state.present, action.next);
    const coalesceKey = options.coalesceKeyOf?.(description);
    const top = state.past.at(-1);

    const merges =
      coalesceKey !== undefined &&
      top !== undefined &&
      top.coalesceKey === coalesceKey &&
      !top.sealed &&
      top.origin === "user" &&
      origin === "user" &&
      action.at - top.updatedAt <= window;

    if (merges) {
      const rest = state.past.slice(0, -1);
      // Typing that ends where it began leaves nothing to undo.
      if (options.isEqual(top.before, action.next)) {
        return { ...state, present: action.next, past: rest, future: [] };
      }
      const merged: UndoStep<T, D> = {
        ...top,
        after: action.next,
        description: options.describe(top.before, action.next),
        updatedAt: action.at,
      };
      return { ...state, present: action.next, past: [...rest, merged], future: [] };
    }

    const step: UndoStep<T, D> = {
      id: state.nextId,
      origin,
      before: state.present,
      after: action.next,
      description,
      coalesceKey,
      createdAt: action.at,
      updatedAt: action.at,
      sealed: false,
    };
    const past = [...state.past, step];
    return {
      present: action.next,
      past: past.length > limit ? past.slice(past.length - limit) : past,
      future: [],
      nextId: state.nextId + 1,
    };
  }

  return function undoStackReducer(
    state: UndoStackState<T, D>,
    action: UndoStackAction<T, D>,
  ): UndoStackState<T, D> {
    switch (action.type) {
      case "record":
        return record(state, action);
      case "seal": {
        const top = state.past.at(-1);
        if (!top || top.sealed) {
          return state;
        }
        return { ...state, past: [...state.past.slice(0, -1), { ...top, sealed: true }] };
      }
      case "undo": {
        const top = state.past.at(-1);
        if (!top) {
          return state;
        }
        return {
          ...state,
          present: top.before,
          past: state.past.slice(0, -1),
          future: [...state.future, { ...top, sealed: true }],
        };
      }
      case "redo": {
        const top = state.future.at(-1);
        if (!top) {
          return state;
        }
        return {
          ...state,
          present: top.after,
          past: [...state.past, top],
          future: state.future.slice(0, -1),
        };
      }
      case "replace":
        return { ...state, present: action.present };
      case "reset":
        return createUndoStackState(action.present);
      default:
        return assertNever(action);
    }
  };
}
