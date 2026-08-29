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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readCatQueueSelectionModePreference,
  writeCatQueueSelectionModePreference,
} from "./use-content-editor-queue-selection-mode";

describe("cat queue selection mode preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to off and skips writes when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", {});

    expect(readCatQueueSelectionModePreference()).toBe(false);
    expect(() => writeCatQueueSelectionModePreference(true)).not.toThrow();
    expect(readCatQueueSelectionModePreference()).toBe(false);
  });

  it("persists selection mode when storage is available", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    });

    expect(readCatQueueSelectionModePreference()).toBe(false);
    writeCatQueueSelectionModePreference(true);
    expect(readCatQueueSelectionModePreference()).toBe(true);
  });
});
