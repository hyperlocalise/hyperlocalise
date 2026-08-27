import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_APP_URL,
  mergeSettings,
  normalizeAppUrl,
  resolvePersistedProjectId,
} from "./settings";

describe("figma plugin settings", () => {
  it("normalizes the app URL and fills defaults", () => {
    expect(normalizeAppUrl("https://app.hyperlocalise.com/")).toBe("https://app.hyperlocalise.com");
    expect(mergeSettings({ appUrl: "https://example.test/", targetLocales: ["fr"] })).toMatchObject(
      {
        appUrl: "https://example.test",
        sourceLocale: "en",
        targetLocales: ["fr"],
        sealedSession: null,
      },
    );
    expect(mergeSettings(null).appUrl).toBe(DEFAULT_APP_URL);
  });

  it("keeps a saved project only when it still exists", () => {
    const projects = [{ id: "project-a" }, { id: "project-b" }];

    expect(resolvePersistedProjectId("project-b", projects)).toBe("project-b");
    expect(resolvePersistedProjectId("missing", projects)).toBe("");
    expect(resolvePersistedProjectId("", projects)).toBe("");
  });
});
