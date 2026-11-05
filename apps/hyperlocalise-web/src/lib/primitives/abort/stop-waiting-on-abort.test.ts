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

import { stopWaitingOnAbort } from "./stop-waiting-on-abort";

describe("stopWaitingOnAbort", () => {
  it("passes the work's result through", async () => {
    await expect(
      stopWaitingOnAbort(Promise.resolve(3), new AbortController().signal),
    ).resolves.toBe(3);
  });

  it("rejects with the signal's reason when it fires first", async () => {
    const controller = new AbortController();
    const waiting = stopWaitingOnAbort(new Promise(() => {}), controller.signal);
    controller.abort(new Error("stopped"));

    await expect(waiting).rejects.toThrow("stopped");
  });

  it("rejects at once for a signal that has already fired", async () => {
    await expect(stopWaitingOnAbort(Promise.resolve(1), AbortSignal.abort())).rejects.toThrow();
  });

  it("does not leave a rejected work unhandled when the signal has already fired", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(
        stopWaitingOnAbort(Promise.reject(new Error("late")), AbortSignal.abort()),
      ).rejects.toBeTruthy();
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
