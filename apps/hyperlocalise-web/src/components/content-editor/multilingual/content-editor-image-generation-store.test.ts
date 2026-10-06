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
import { describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorImageGenerationStore } from "./content-editor-image-generation-store";

describe("ContentEditorImageGenerationStore", () => {
  it("tracks a running generation and clears it on success", async () => {
    const store = new ContentEditorImageGenerationStore();
    let finish!: () => void;
    const work = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const running = store.run("hero", "de", work);
    expect(store.get("hero", "de")).toEqual({
      status: "running",
      startedAt: expect.any(Number),
    });
    expect(store.runningCount).toBe(1);
    expect(work).toHaveBeenCalledWith(expect.any(AbortSignal));

    finish();
    await running;
    expect(store.get("hero", "de")).toBeUndefined();
    expect(store.runningCount).toBe(0);
  });

  it("keeps a failed generation after the work rejects", async () => {
    const store = new ContentEditorImageGenerationStore();
    await store.run("hero", "fr", () => Promise.reject(new Error("unavailable")));
    expect(store.get("hero", "fr")).toEqual({ status: "failed" });
    expect(store.runningCount).toBe(0);
  });

  it("does not start a second request for the same image and locale", async () => {
    const store = new ContentEditorImageGenerationStore();
    let finish!: () => void;
    const work = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const first = store.run("hero", "de", work);
    await store.run("hero", "de", work);
    expect(work).toHaveBeenCalledTimes(1);

    finish();
    await first;
  });

  it("ignores a stale settle after the store is cleared", async () => {
    const store = new ContentEditorImageGenerationStore();
    let fail!: (error: Error) => void;
    const running = store.run(
      "hero",
      "de",
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    store.clear();
    expect(store.get("hero", "de")).toBeUndefined();

    fail(new Error("unavailable"));
    await running;
    expect(store.get("hero", "de")).toBeUndefined();
  });

  it("aborts the in-flight request when the store is cleared", async () => {
    const store = new ContentEditorImageGenerationStore();
    let signal!: AbortSignal;
    const running = store.run("hero", "de", (nextSignal) => {
      signal = nextSignal;
      return new Promise<void>((_, reject) => {
        nextSignal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    store.clear();
    expect(signal.aborted).toBe(true);
    await running;
    expect(store.get("hero", "de")).toBeUndefined();
  });

  it("does not mark a newer run failed when a cleared request rejects", async () => {
    const store = new ContentEditorImageGenerationStore();
    let failFirst!: (error: Error) => void;
    const first = store.run(
      "hero",
      "de",
      () =>
        new Promise<void>((_, reject) => {
          failFirst = reject;
        }),
    );
    store.clear();

    let finishSecond!: () => void;
    const second = store.run(
      "hero",
      "de",
      () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
    );
    expect(store.get("hero", "de")?.status).toBe("running");

    failFirst(new Error("unavailable"));
    await first;
    expect(store.get("hero", "de")?.status).toBe("running");

    finishSecond();
    await second;
    expect(store.get("hero", "de")).toBeUndefined();
  });

  it("does not clear a newer run when an older request succeeds", async () => {
    const store = new ContentEditorImageGenerationStore();
    let finishFirst!: () => void;
    const first = store.run(
      "hero",
      "de",
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    store.clear();

    let finishSecond!: () => void;
    const second = store.run(
      "hero",
      "de",
      () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
    );
    expect(store.get("hero", "de")?.status).toBe("running");

    finishFirst();
    await first;
    expect(store.get("hero", "de")?.status).toBe("running");

    finishSecond();
    await second;
    expect(store.get("hero", "de")).toBeUndefined();
  });
});
