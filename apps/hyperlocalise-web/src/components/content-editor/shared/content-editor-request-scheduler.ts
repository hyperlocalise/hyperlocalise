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
/** Bound background editor requests while letting the selected row jump the queue. */
export function createContentEditorRequestScheduler(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  function drain() {
    while (active < concurrency && queue.length > 0) queue.shift()?.();
  }
  return function run<T>(
    request: () => Promise<T>,
    signal?: AbortSignal,
    priority = false,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const aborted = () => {
        const index = queue.indexOf(start);
        if (index >= 0) queue.splice(index, 1);
        reject(new DOMException("Request aborted", "AbortError"));
      };
      const start = () => {
        signal?.removeEventListener("abort", aborted);
        if (signal?.aborted) {
          aborted();
          return;
        }
        active += 1;
        void Promise.resolve()
          .then(request)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            drain();
          });
      };
      if (signal?.aborted) {
        aborted();
        return;
      }
      signal?.addEventListener("abort", aborted, { once: true });
      if (priority) queue.unshift(start);
      else queue.push(start);
      drain();
    });
  };
}
