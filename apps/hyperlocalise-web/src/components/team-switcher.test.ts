import { describe, expect, it } from "vite-plus/test";

import { buildOrganizationSwitchReturnTo } from "./team-switcher";

describe("buildOrganizationSwitchReturnTo", () => {
  it("rewrites the active organization segment in org-scoped paths", () => {
    expect(buildOrganizationSwitchReturnTo("/org/acme/projects/123", "acme", "beta")).toBe(
      "/org/beta/projects/123",
    );
  });

  it("falls back to the target dashboard for non-org paths", () => {
    expect(buildOrganizationSwitchReturnTo("/auth/onboarding", "acme", "beta")).toBe(
      "/org/beta/dashboard",
    );
  });
});
