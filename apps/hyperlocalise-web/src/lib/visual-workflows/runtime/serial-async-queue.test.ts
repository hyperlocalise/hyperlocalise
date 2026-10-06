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

import { createSerialAsyncQueue } from "./serial-async-queue";

describe("createSerialAsyncQueue", () => {
  it("lets drain wait for work that is already in flight", async () => {
    const queue = createSerialAsyncQueue();
    let finished = false;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      queue.enqueue(async () => {
        resolve();
        await new Promise<void>((resolveRelease) => {
          release = resolveRelease;
        });
        finished = true;
      });
    });

    await started;
    const drained = queue.drain();
    expect(finished).toBe(false);
    release();
    await drained;
    expect(finished).toBe(true);
  });

  it("runs queued work in order and keeps draining after a failure", async () => {
    const queue = createSerialAsyncQueue();
    const seen: string[] = [];
    const errors: unknown[] = [];

    queue.enqueue(async () => {
      seen.push("first");
    });
    queue.enqueue(
      async () => {
        throw new Error("renew_failed");
      },
      (error) => {
        errors.push(error);
      },
    );
    queue.enqueue(async () => {
      seen.push("third");
    });

    await queue.drain();
    expect(seen).toEqual(["first", "third"]);
    expect(errors).toEqual([new Error("renew_failed")]);
  });
});
