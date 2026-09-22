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
import { createContentEditorRequestScheduler } from "./content-editor-request-scheduler";

describe("editor request scheduling", () => {
  it("bounds active requests and prioritizes the selected row", async () => {
    const schedule = createContentEditorRequestScheduler(1);
    let release!: () => void;
    const order: string[] = [];
    const first = schedule(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    const background = schedule(async () => {
      order.push("background");
    });
    const selected = schedule(
      async () => {
        order.push("selected");
      },
      undefined,
      true,
    );
    expect(order).toEqual([]);
    release();
    await Promise.all([first, background, selected]);
    expect(order).toEqual(["selected", "background"]);
  });

  it("cancels queued requests before they reach the server", async () => {
    const schedule = createContentEditorRequestScheduler(1);
    let release!: () => void;
    const first = schedule(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    const abort = new AbortController();
    let started = false;
    const queued = schedule(async () => {
      started = true;
    }, abort.signal);
    abort.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    release();
    await first;
    expect(started).toBe(false);
  });
});
