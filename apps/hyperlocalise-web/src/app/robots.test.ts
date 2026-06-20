import { describe, expect, it } from "vite-plus/test";

import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";
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

    const localizedPaths = SUPPORTED_APP_LOCALES.flatMap((locale) => [
      `/${locale}/dashboard/`,
      `/${locale}/org/`,
    ]);
    expect(disallow).toEqual(
      expect.arrayContaining(["/auth/", "/api/", "/mcp", ...localizedPaths]),
    );
    expect(config.sitemap).toBe("https://www.hyperlocalise.com/sitemap.xml");
  });
});
