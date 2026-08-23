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

export type BrowserLocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Best-effort access to `localStorage`.
 *
 * Returns `undefined` during SSR, when the Storage API is missing, and when
 * private browsing / quota / disabled-cookie policies throw on access.
 * Callers should skip persistence rather than treating storage as required.
 */
export function getBrowserLocalStorage(): BrowserLocalStorage | undefined {
  try {
    const fromGlobal = globalThis.localStorage;
    if (fromGlobal) {
      return fromGlobal;
    }
  } catch {
    return undefined;
  }

  try {
    if (typeof window === "undefined") {
      return undefined;
    }

    return window.localStorage || undefined;
  } catch {
    return undefined;
  }
}

export function readBrowserLocalStorageItem(key: string): string | null {
  try {
    return getBrowserLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeBrowserLocalStorageItem(key: string, value: string) {
  try {
    getBrowserLocalStorage()?.setItem(key, value);
  } catch {
    // Ignore private browsing, quota, and disabled-storage failures.
  }
}

export function removeBrowserLocalStorageItem(key: string) {
  try {
    getBrowserLocalStorage()?.removeItem(key);
  } catch {
    // Ignore private browsing, quota, and disabled-storage failures.
  }
}
