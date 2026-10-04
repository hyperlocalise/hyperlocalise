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
// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  forgetDocumentAutosaveDraft,
  peekDocumentAutosaveDraft,
  useDocumentAutosave,
} from "./document-editor-autosave";

const DELAY = 1_000;

function setup(save: (value: string) => Promise<void>) {
  return renderHook(
    ({ value }: { value: string }) =>
      useDocumentAutosave({ value, baseline: "a", save, delayMs: DELAY }),
    { initialProps: { value: "a" } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  forgetDocumentAutosaveDraft("doc-1");
});
afterEach(() => {
  vi.useRealTimers();
  forgetDocumentAutosaveDraft("doc-1");
});

describe("useDocumentAutosave", () => {
  it("saves once after typing stops", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup(save);

    rerender({ value: "ab" });
    expect(result.current.status.kind).toBe("dirty");
    await act(() => vi.advanceTimersByTimeAsync(DELAY / 2));
    rerender({ value: "abc" });
    await act(() => vi.advanceTimersByTimeAsync(DELAY));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc");
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it("queues one follow-up save for edits made during a save", async () => {
    let finish: () => void = () => {};
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(save);

    rerender({ value: "ab" });
    await act(() => vi.advanceTimersByTimeAsync(DELAY));
    rerender({ value: "abc" });
    await act(() => result.current.saveNow());
    await act(async () => finish());
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(save.mock.calls.map(([value]) => value)).toEqual(["ab", "abc"]);
    expect(result.current.status.kind).toBe("saved");
  });

  it("stops after a failure until retried", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const { result, rerender } = setup(save);

    rerender({ value: "ab" });
    await act(() => vi.advanceTimersByTimeAsync(DELAY));
    expect(result.current.status.kind).toBe("error");

    rerender({ value: "abc" });
    await act(() => vi.advanceTimersByTimeAsync(DELAY * 2));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(() => result.current.retry());
    expect(save).toHaveBeenLastCalledWith("abc");
    expect(result.current.status.kind).toBe("saved");
  });

  it("keeps a failed unmount save so the document can be retried", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const abandoned = vi.fn();
    const { unmount } = renderHook(() =>
      useDocumentAutosave({
        id: "doc-1",
        value: "ab",
        baseline: "a",
        save,
        delayMs: DELAY,
        onAbandonedSaveError: abandoned,
      }),
    );

    unmount();
    await act(() => Promise.resolve());
    await act(() => Promise.resolve());

    expect(save).toHaveBeenCalledWith("ab");
    expect(abandoned).toHaveBeenCalledTimes(1);
    expect(peekDocumentAutosaveDraft("doc-1")).toEqual({ value: "ab", failed: true });
  });

  it("clears a draft only after that snapshot is saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }: { value: string }) =>
        useDocumentAutosave({
          id: "doc-1",
          value,
          baseline: "a",
          save,
          delayMs: DELAY,
        }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    expect(peekDocumentAutosaveDraft("doc-1")).toEqual({ value: "ab", failed: false });
    await act(() => vi.advanceTimersByTimeAsync(DELAY));
    expect(peekDocumentAutosaveDraft("doc-1")).toBeUndefined();
  });

  it("keeps a newer failed draft when an older in-flight save succeeds after leaving", async () => {
    let finishOlder: () => void = () => {};
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishOlder = resolve)))
      .mockRejectedValue(new Error("offline"));
    const { rerender, unmount } = renderHook(
      ({ value }: { value: string }) =>
        useDocumentAutosave({
          id: "doc-1",
          value,
          baseline: "a",
          save,
          delayMs: DELAY,
        }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    await act(() => vi.advanceTimersByTimeAsync(DELAY));
    rerender({ value: "abc" });
    unmount();
    await act(() => Promise.resolve());
    await act(() => Promise.resolve());
    expect(peekDocumentAutosaveDraft("doc-1")).toEqual({ value: "abc", failed: true });

    await act(async () => {
      finishOlder();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(peekDocumentAutosaveDraft("doc-1")).toEqual({ value: "abc", failed: true });
  });
});
