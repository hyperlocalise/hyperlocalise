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
  loadSettings,
  parseSelectedPageValues,
  parseTargetLocales,
  projectLocalesToSettings,
  saveSettings,
  selectedPageValues,
} from "./settings";

describe("settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies project locales into settings", () => {
    expect(
      projectLocalesToSettings({
        sourceLocale: "en-US",
        targetLocales: ["fr-FR", "de-DE"],
      }),
    ).toEqual({
      sourceLocale: "en-US",
      targetLocales: "fr-FR, de-DE",
    });
  });

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
      organizationSlug: "acme",
      organizationName: "Acme",
      projectId: "project_1",
      projectName: "Marketing",
      sourceLocale: "en",
      targetLocales: "es,fr",
      preserveFormatting: true,
      selectedPageIndices: [0, 1],
      lastJobId: "job_1",
    });

    expect(loadSettings()).toEqual({
      connectionToken: "hl_canva_test_token",
      organizationSlug: "acme",
      organizationName: "Acme",
      projectId: "project_1",
      projectName: "Marketing",
      sourceLocale: "en",
      targetLocales: "es,fr",
      preserveFormatting: true,
      selectedPageIndices: [0, 1],
      lastJobId: "job_1",
    });
  });

  it("does not load older settings keys", () => {
    const storage = new Map<string, string>([
      [
        "hyperlocalise:canva-app:settings:v3",
        JSON.stringify({
          connectionToken: "hl_canva_legacy",
          sourceLocale: "en",
          targetLocales: "fr",
        }),
      ],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    expect(loadSettings()).toEqual({
      connectionToken: "",
      organizationSlug: "",
      organizationName: "",
      projectId: "",
      projectName: "",
      sourceLocale: "",
      targetLocales: "",
      preserveFormatting: true,
      selectedPageIndices: [],
      lastJobId: "",
    });
  });
});
