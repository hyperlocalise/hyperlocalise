import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_APP_URL, mergeSettings, normalizeAppUrl } from "./settings";

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
});
