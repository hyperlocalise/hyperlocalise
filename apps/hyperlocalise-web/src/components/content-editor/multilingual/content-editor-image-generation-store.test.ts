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

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("ContentEditorImageGenerationStore", () => {
  it("tracks a running generation and clears it on success", async () => {
    const store = new ContentEditorImageGenerationStore();
    const pending = deferred();
    const work = vi.fn(() => pending.promise);

    const running = store.run("hero", "de", work);
    expect(store.get("hero", "de")).toMatchObject({
      segmentId: "hero",
      locale: "de",
      status: "running",
      startedAt: expect.any(Number),
    });
    expect(store.runningCount).toBe(1);
    expect(work).toHaveBeenCalledWith(expect.any(AbortSignal));

    pending.resolve();
    await running;
    expect(store.get("hero", "de")).toBeUndefined();
    expect(store.runningCount).toBe(0);
  });

  it("keeps a failed generation after the work rejects", async () => {
    const store = new ContentEditorImageGenerationStore();
    await store.run("hero", "fr", () => Promise.reject(new Error("unavailable")));
    expect(store.get("hero", "fr")?.status).toBe("failed");
    expect(store.runningCount).toBe(0);
  });

  it("marks a request that aborts on its own as failed instead of leaving it running", async () => {
    const store = new ContentEditorImageGenerationStore();
    await store.run("hero", "fr", () =>
      Promise.reject(new DOMException("The operation timed out", "AbortError")),
    );
    expect(store.get("hero", "fr")?.status).toBe("failed");
  });

  it("retries after a failure", async () => {
    const store = new ContentEditorImageGenerationStore();
    await store.run("hero", "fr", () => Promise.reject(new Error("unavailable")));

    const work = vi.fn(() => Promise.resolve());
    await store.run("hero", "fr", work);
    expect(work).toHaveBeenCalledOnce();
    expect(store.get("hero", "fr")).toBeUndefined();
  });

  it("does not start a second request for the same image and locale", async () => {
    const store = new ContentEditorImageGenerationStore();
    const pending = deferred();
    const work = vi.fn(() => pending.promise);

    const first = store.run("hero", "de", work);
    await store.run("hero", "de", work);
    expect(work).toHaveBeenCalledTimes(1);

    pending.resolve();
    await first;
  });

  it("aborts in-flight requests and drops progress on cancelAll", async () => {
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
    await store.run("hero", "fr", () => Promise.reject(new Error("unavailable")));

    store.cancelAll();
    expect(signal.aborted).toBe(true);
    expect(store.get("hero", "fr")).toBeUndefined();
    await running;
    expect(store.get("hero", "de")).toBeUndefined();
  });

  it("does not mark a newer run failed when a cancelled request rejects", async () => {
    const store = new ContentEditorImageGenerationStore();
    const firstWork = deferred();
    const first = store.run("hero", "de", () => firstWork.promise);
    store.cancelAll();

    const secondWork = deferred();
    const second = store.run("hero", "de", () => secondWork.promise);
    expect(store.get("hero", "de")?.status).toBe("running");

    firstWork.reject(new Error("unavailable"));
    await first;
    expect(store.get("hero", "de")?.status).toBe("running");

    secondWork.resolve();
    await second;
    expect(store.get("hero", "de")).toBeUndefined();
  });

  it("does not clear a newer run when a cancelled request succeeds", async () => {
    const store = new ContentEditorImageGenerationStore();
    const firstWork = deferred();
    const first = store.run("hero", "de", () => firstWork.promise);
    store.cancelAll();

    const secondWork = deferred();
    const second = store.run("hero", "de", () => secondWork.promise);

    firstWork.resolve();
    await first;
    expect(store.get("hero", "de")?.status).toBe("running");

    secondWork.resolve();
    await second;
    expect(store.get("hero", "de")).toBeUndefined();
  });
});
