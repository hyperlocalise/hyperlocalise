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
import type { OtaObjectStore, OtaStoredObject } from "./store";

export function createMemoryOtaObjectStore(
  initial: Iterable<[string, OtaStoredObject]> = [],
): OtaObjectStore & { snapshot(): Map<string, OtaStoredObject> } {
  const objects = new Map<string, OtaStoredObject>(initial);

  return {
    async put(input) {
      objects.set(input.key, {
        body: Buffer.from(input.body),
        contentType: input.contentType,
        cacheControl: input.cacheControl,
      });
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) {
        return null;
      }
      return {
        body: Buffer.from(stored.body),
        contentType: stored.contentType,
        cacheControl: stored.cacheControl,
      };
    },
    async deletePrefix(prefix) {
      const keys = Array.from(objects.keys());
      for (const key of keys) {
        if (key === prefix || key.startsWith(prefix)) {
          objects.delete(key);
        }
      }
    },
    snapshot() {
      return new Map(objects);
    },
  };
}
