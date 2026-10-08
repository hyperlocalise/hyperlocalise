"use client";

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
import { useCallback, useMemo, useReducer, useRef, useState } from "react";

import {
  createUndoStackReducer,
  createUndoStackState,
  nextRedoStep,
  nextUndoStep,
  type UndoOrigin,
  type UndoStackAction,
  type UndoStackOptions,
  type UndoStackState,
  type UndoStep,
} from "./undo-stack";

export type UseUndoStackResult<T, D> = {
  /** The document as it is now. */
  form: T;
  change: (next: T, meta?: { origin?: UndoOrigin; description?: D }) => void;
  /** Closes the current burst of typing, so the next change starts a new step. */
  seal: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The step the next undo would take back; read it before calling `undo` to describe it. */
  undoStep: UndoStep<T, D> | null;
  redoStep: UndoStep<T, D> | null;
  /** Sets the document without a step. */
  replace: (present: T) => void;
  /** Sets the document and forgets every step. */
  reset: (present: T) => void;
};

/**
 * Owns a document through an undo stack. Every `change` is a step, bursts of typing merge into
 * one, and undo or redo swap whole snapshots in. The options are read fresh on each action, so
 * they may be recreated between renders.
 */
export function useUndoStack<T, D>(
  initial: T,
  options: UndoStackOptions<T, D>,
): UseUndoStackResult<T, D> {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // The reducer is made once and reads the latest options through the ref.
  const [reducer] = useState(() =>
    createUndoStackReducer<T, D>({
      isEqual: (a, b) => optionsRef.current.isEqual(a, b),
      describe: (before, after) => optionsRef.current.describe(before, after),
      coalesceKeyOf: (description) => optionsRef.current.coalesceKeyOf?.(description),
      coalesceWindowMs: options.coalesceWindowMs,
      limit: options.limit,
    }),
  );
  const [state, dispatch] = useReducer(
    reducer as (state: UndoStackState<T, D>, action: UndoStackAction<T, D>) => UndoStackState<T, D>,
    initial,
    createUndoStackState<T, D>,
  );

  const change = useCallback(
    (next: T, meta?: { origin?: UndoOrigin; description?: D }) =>
      dispatch({ type: "record", next, at: Date.now(), ...meta }),
    [],
  );
  const seal = useCallback(() => dispatch({ type: "seal" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const replace = useCallback((present: T) => dispatch({ type: "replace", present }), []);
  const reset = useCallback((present: T) => dispatch({ type: "reset", present }), []);

  return useMemo(
    () => ({
      form: state.present,
      change,
      seal,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      undoStep: nextUndoStep(state),
      redoStep: nextRedoStep(state),
      replace,
      reset,
    }),
    [state, change, seal, undo, redo, replace, reset],
  );
}
