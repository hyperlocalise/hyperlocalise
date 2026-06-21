import { describe, expect, it, vi } from "vite-plus/test";

import { loadSettings, parseTargetLocales, saveSettings } from "./settings";

describe("settings", () => {
  it("parses target locales from comma-separated values", () => {
    expect(parseTargetLocales("es, fr , de")).toEqual(["es", "fr", "de"]);
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
      projectId: "project_123",
      sourceLocale: "en",
      targetLocales: "es,fr",
      preserveFormatting: true,
    });

    expect(loadSettings()).toEqual({
      projectId: "project_123",
      sourceLocale: "en",
      targetLocales: "es,fr",
      preserveFormatting: true,
    });
  });
});
