import { describe, expect, it } from "vite-plus/test";

import { effectiveWorkspaceSyncFilter } from "./workspace-filter-params";

describe("effectiveWorkspaceSyncFilter", () => {
  it("preserves sync filters for local list browsing", () => {
    expect(effectiveWorkspaceSyncFilter("synced", false)).toBe("synced");
    expect(effectiveWorkspaceSyncFilter("error", false)).toBe("error");
  });

  it("ignores sync filters while browsing live TMS resources", () => {
    expect(effectiveWorkspaceSyncFilter("synced", true)).toBe("all");
    expect(effectiveWorkspaceSyncFilter("error", true)).toBe("all");
    expect(effectiveWorkspaceSyncFilter("all", true)).toBe("all");
  });
});
