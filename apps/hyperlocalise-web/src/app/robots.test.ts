import { describe, expect, it } from "vite-plus/test";

import robots from "./robots";

describe("robots", () => {
  it("allows public pages and blocks auth, api, and workspace routes", () => {
    const config = robots();

    expect(config.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
    });

    const disallow = Array.isArray(config.rules)
      ? config.rules.flatMap((rule) => rule.disallow ?? [])
      : (config.rules?.disallow ?? []);

    expect(disallow).toEqual(
      expect.arrayContaining(["/auth/", "/api/", "/mcp", "/en/dashboard", "/en/org/"]),
    );
    expect(config.sitemap).toBe("https://www.hyperlocalise.com/sitemap.xml");
  });
});
