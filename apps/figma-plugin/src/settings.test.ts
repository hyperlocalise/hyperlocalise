import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_APP_URL,
  hadLegacyFigmaSession,
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
        personalAccessToken: null,
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

  it("clears a legacy sealed session and keeps a PAT", () => {
    const legacy = {
      appUrl: "https://app.hyperlocalise.com",
      sealedSession: "sealed.session.value",
      userEmail: "dev@example.com",
      organizationSlug: "acme",
    };

    expect(hadLegacyFigmaSession(legacy)).toBe(true);
    expect(mergeSettings(legacy)).toMatchObject({
      personalAccessToken: null,
      userEmail: "dev@example.com",
      organizationSlug: "acme",
    });
    expect(mergeSettings(legacy)).not.toHaveProperty("sealedSession");

    const connected = {
      ...legacy,
      personalAccessToken: "hl_example_token",
    };
    expect(hadLegacyFigmaSession(connected)).toBe(false);
    expect(mergeSettings(connected).personalAccessToken).toBe("hl_example_token");
  });
});
