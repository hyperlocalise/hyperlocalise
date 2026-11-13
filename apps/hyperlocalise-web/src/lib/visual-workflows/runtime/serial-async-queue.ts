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

/**
 * Serialize async work so a later drain waits for anything already in flight.
 * Used to finish a lease renewal before a durable slice releases its claim.
 */
export function createSerialAsyncQueue() {
  let tail = Promise.resolve();
  return {
    enqueue(work: () => Promise<void>, onError?: (error: unknown) => void) {
      tail = tail
        .catch(() => undefined)
        .then(work)
        .catch((error: unknown) => {
          onError?.(error);
        });
    },
    drain() {
      return tail;
    },
  };
}
