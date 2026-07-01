import { describe, expect, it } from "vite-plus/test";

import {
  CROWDIN_DEFAULT_API_BASE_URL,
  crowdinAuthenticatedUserUrl,
  normalizeCrowdinApiBaseUrl,
  resolveCrowdinApiBaseUrl,
} from "./crowdin-base-url";

describe("crowdin-base-url", () => {
  it("resolves the default SaaS API base URL", () => {
    expect(resolveCrowdinApiBaseUrl()).toBe(CROWDIN_DEFAULT_API_BASE_URL);
    expect(normalizeCrowdinApiBaseUrl()).toBe(CROWDIN_DEFAULT_API_BASE_URL);
  });

  it("preserves enterprise API base URLs that already include /api/v2", () => {
    expect(resolveCrowdinApiBaseUrl("https://enterprise.crowdin.test/api/v2")).toBe(
      "https://enterprise.crowdin.test/api/v2",
    );
  });

  it("builds the authenticated user URL without duplicating /api/v2", () => {
    expect(crowdinAuthenticatedUserUrl()).toBe("https://api.crowdin.com/api/v2/user");
    expect(crowdinAuthenticatedUserUrl("https://enterprise.crowdin.test/api/v2")).toBe(
      "https://enterprise.crowdin.test/api/v2/user",
    );
  });
});
