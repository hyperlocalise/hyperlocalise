/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it, vi } from "vite-plus/test";

import {
  loadSettings,
  parseSelectedPageValues,
  parseTargetLocales,
  saveSettings,
  selectedPageValues,
} from "./settings";

describe("settings", () => {
  it("parses target locales from comma-separated values", () => {
    expect(parseTargetLocales("es, fr , de")).toEqual(["es", "fr", "de"]);
  });

  it("converts selected page indices to checkbox values", () => {
    expect(selectedPageValues([0, 2, 5])).toEqual(["0", "2", "5"]);
    expect(parseSelectedPageValues(["0", "2", "5"])).toEqual([0, 2, 5]);
  });

  it("persists settings in local storage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    saveSettings({
      connectionToken: "hl_canva_test_token",
      projectId: "project_123",
      sourceLocale: "en",
      targetLocales: "es,fr",
      preserveFormatting: true,
      selectedPageIndices: [0, 1],
    });

    expect(loadSettings()).toEqual({
      connectionToken: "hl_canva_test_token",
      projectId: "project_123",
      sourceLocale: "en",
      targetLocales: "es,fr",
      preserveFormatting: true,
      selectedPageIndices: [0, 1],
    });
  });
});
