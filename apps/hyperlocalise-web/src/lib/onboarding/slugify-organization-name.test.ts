import { describe, expect, it } from "vite-plus/test";

import { slugifyOrganizationName } from "./slugify-organization-name";

describe("slugifyOrganizationName", () => {
  it("normalizes names into URL-safe slugs", () => {
    expect(slugifyOrganizationName("Acme localisation")).toBe("acme-localisation");
    expect(slugifyOrganizationName("  Foo & Bar!!!  ")).toBe("foo-bar");
  });

  it("falls back to workspace when the name has no slug characters", () => {
    expect(slugifyOrganizationName("   ")).toBe("workspace");
    expect(slugifyOrganizationName("---")).toBe("workspace");
  });
});
