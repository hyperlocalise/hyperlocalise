// @vitest-environment happy-dom

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
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { UndoStackOptions } from "./undo-stack";
import { useUndoStack } from "./use-undo-stack";

type Doc = { name: string };
type Change = { field: "name" };

const options: UndoStackOptions<Doc, Change> = {
  isEqual: (a, b) => a.name === b.name,
  describe: () => ({ field: "name" }),
  coalesceKeyOf: () => "text:name",
};

describe("useUndoStack", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records changes and undoes and redoes them", () => {
    const { result } = renderHook(() => useUndoStack({ name: "" }, options));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.undoStep).toBeNull();

    act(() => result.current.change({ name: "a" }));
    expect(result.current.form).toEqual({ name: "a" });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoStep).toMatchObject({ before: { name: "" }, after: { name: "a" } });

    act(() => result.current.undo());
    expect(result.current.form).toEqual({ name: "" });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.redoStep).toMatchObject({ after: { name: "a" } });

    act(() => result.current.redo());
    expect(result.current.form).toEqual({ name: "a" });
    expect(result.current.canRedo).toBe(false);
  });

  it("merges quick changes into one step and starts another after seal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { result } = renderHook(() => useUndoStack({ name: "" }, options));

    act(() => result.current.change({ name: "a" }));
    vi.setSystemTime(1200);
    act(() => result.current.change({ name: "ab" }));
    expect(result.current.undoStep).toMatchObject({ before: { name: "" }, after: { name: "ab" } });

    act(() => result.current.seal());
    vi.setSystemTime(1300);
    act(() => result.current.change({ name: "abc" }));
    expect(result.current.undoStep).toMatchObject({
      before: { name: "ab" },
      after: { name: "abc" },
    });
  });

  it("passes the origin and description through to the step", () => {
    const { result } = renderHook(() => useUndoStack({ name: "" }, options));

    act(() =>
      result.current.change({ name: "a" }, { origin: "system", description: { field: "name" } }),
    );

    expect(result.current.undoStep?.origin).toBe("system");
  });

  it("replaces without a step and resets by forgetting the steps", () => {
    const { result } = renderHook(() => useUndoStack({ name: "" }, options));

    act(() => result.current.change({ name: "a" }));
    act(() => result.current.replace({ name: "z" }));
    expect(result.current.form).toEqual({ name: "z" });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.reset({ name: "" }));
    expect(result.current.form).toEqual({ name: "" });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("uses the latest options without recreating the reducer", () => {
    const equalByLength: UndoStackOptions<Doc, Change> = {
      ...options,
      isEqual: (a, b) => a.name.length === b.name.length,
    };
    const { result, rerender } = renderHook(
      ({ current }: { current: UndoStackOptions<Doc, Change> }) =>
        useUndoStack({ name: "" }, current),
      { initialProps: { current: options } },
    );

    rerender({ current: equalByLength });
    act(() => result.current.change({ name: "x" }));
    act(() => result.current.seal());
    act(() => result.current.change({ name: "y" }));

    // Same length counts as equal now, so the second change records nothing.
    expect(result.current.form).toEqual({ name: "x" });
  });
});
