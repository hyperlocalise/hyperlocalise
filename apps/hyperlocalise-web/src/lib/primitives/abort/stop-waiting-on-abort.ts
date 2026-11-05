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
 * Stops waiting for `work` when the signal fires, rejecting with the signal's reason. The work
 * itself carries on: use it for steps that can't be cancelled, such as a DNS lookup.
 */
export function stopWaitingOnAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    // Always observe `work` first. If the signal has already fired we still reject
    // immediately, but a later failure must not become an unhandled rejection.
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
