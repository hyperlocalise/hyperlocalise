import { describe, expect, it } from "vite-plus/test";

import {
  isKnownWorkosLocalizationRoleSlug,
  WORKOS_LOCALIZATION_ROLE_SLUGS,
} from "./localization-role-slugs";

describe("WORKOS_LOCALIZATION_ROLE_SLUGS", () => {
  it("lists every supported WorkOS role slug", () => {
    expect(WORKOS_LOCALIZATION_ROLE_SLUGS).toEqual([
      "admin",
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
      "contractor",
      "member",
    ]);
  });
});

describe("isKnownWorkosLocalizationRoleSlug", () => {
  it("accepts supported slugs", () => {
    for (const slug of WORKOS_LOCALIZATION_ROLE_SLUGS) {
      expect(isKnownWorkosLocalizationRoleSlug(slug)).toBe(true);
    }
  });

  it("rejects unknown slugs", () => {
    expect(isKnownWorkosLocalizationRoleSlug("owner")).toBe(false);
    expect(isKnownWorkosLocalizationRoleSlug(undefined)).toBe(false);
  });
});
