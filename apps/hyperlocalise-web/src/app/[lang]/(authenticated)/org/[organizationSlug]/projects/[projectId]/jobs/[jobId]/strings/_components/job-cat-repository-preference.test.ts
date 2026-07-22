/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  catFileRepositoryPreferenceKey,
  readCatFileRepositoryPreference,
  writeCatFileRepositoryPreference,
} from "./job-cat-repository-preference";

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("job-cat-repository-preference", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a stable storage key per file", () => {
    expect(catFileRepositoryPreferenceKey("acme", "project-1", "en-US.json")).toBe(
      "job-cat-repository:acme:project-1:en-US.json",
    );
  });

  it("persists and reads the selected repository for a file", () => {
    const storageKey = catFileRepositoryPreferenceKey("acme", "project-1", "en-US.json");

    writeCatFileRepositoryPreference(storageKey, "acme/web");
    expect(readCatFileRepositoryPreference(storageKey)).toBe("acme/web");
  });
});
