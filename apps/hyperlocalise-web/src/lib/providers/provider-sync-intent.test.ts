import { describe, expect, it } from "vite-plus/test";

import { buildProviderSyncLeaseKey } from "@/lib/providers/provider-sync-intent";

describe("buildProviderSyncLeaseKey", () => {
  it("uses an empty project segment for catalog scans", () => {
    expect(
      buildProviderSyncLeaseKey({
        organizationId: "org-1",
        providerKind: "crowdin",
        syncKind: "project_scan",
      }),
    ).toBe("org-1:crowdin:project_scan::");
  });

  it("scopes per-project scans by project id", () => {
    expect(
      buildProviderSyncLeaseKey({
        organizationId: "org-1",
        providerKind: "crowdin",
        syncKind: "project_scan",
        projectId: "ext:crowdin:123",
      }),
    ).toBe("org-1:crowdin:project_scan:ext:crowdin:123:");
  });
});
