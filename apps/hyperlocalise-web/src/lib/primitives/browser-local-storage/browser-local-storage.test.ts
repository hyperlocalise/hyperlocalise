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
  getBrowserLocalStorage,
  readBrowserLocalStorageItem,
  removeBrowserLocalStorageItem,
  writeBrowserLocalStorageItem,
} from "./browser-local-storage";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    values,
  };
}

describe("browser-local-storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined when no storage API is available", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", undefined);

    expect(getBrowserLocalStorage()).toBeUndefined();
    expect(readBrowserLocalStorageItem("theme")).toBeNull();
    expect(() => writeBrowserLocalStorageItem("theme", "dark")).not.toThrow();
    expect(() => removeBrowserLocalStorageItem("theme")).not.toThrow();
  });

  it("reads and writes through the global storage object", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);

    writeBrowserLocalStorageItem("theme", "dark");
    expect(readBrowserLocalStorageItem("theme")).toBe("dark");
    removeBrowserLocalStorageItem("theme");
    expect(readBrowserLocalStorageItem("theme")).toBeNull();
    expect(storage.setItem).toHaveBeenCalledWith("theme", "dark");
    expect(storage.removeItem).toHaveBeenCalledWith("theme");
  });

  it("falls back to window.localStorage when the global identifier is missing", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", { localStorage: storage });

    writeBrowserLocalStorageItem("theme", "light");
    expect(readBrowserLocalStorageItem("theme")).toBe("light");
  });

  it("skips storage when the Storage getter throws", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("Access is denied for this document");
      },
    });

    expect(getBrowserLocalStorage()).toBeUndefined();
    expect(readBrowserLocalStorageItem("theme")).toBeNull();
    expect(() => writeBrowserLocalStorageItem("theme", "dark")).not.toThrow();
  });

  it("skips storage when getItem or setItem throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("QuotaExceededError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("QuotaExceededError");
      },
    });

    expect(readBrowserLocalStorageItem("theme")).toBeNull();
    expect(() => writeBrowserLocalStorageItem("theme", "dark")).not.toThrow();
    expect(() => removeBrowserLocalStorageItem("theme")).not.toThrow();
  });
});
