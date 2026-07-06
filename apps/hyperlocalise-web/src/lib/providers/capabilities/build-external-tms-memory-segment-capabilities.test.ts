import { describe, expect, it } from "vite-plus/test";

import { buildExternalTmsMemorySegmentCapabilities } from "./build-external-tms-memory-segment-capabilities";

describe("buildExternalTmsMemorySegmentCapabilities", () => {
  it("describes live-search capability mode", () => {
    expect(buildExternalTmsMemorySegmentCapabilities("live_search")).toEqual({
      mode: "live_search",
      search: true,
      import: false,
      export: false,
      referenceOnly: false,
    });
  });

  it("describes synced/import capability mode", () => {
    expect(buildExternalTmsMemorySegmentCapabilities("synced_import")).toEqual({
      mode: "synced_import",
      search: true,
      import: true,
      export: true,
      referenceOnly: false,
    });
  });

  it("describes reference-only capability mode", () => {
    expect(buildExternalTmsMemorySegmentCapabilities("reference_only")).toEqual({
      mode: "reference_only",
      search: false,
      import: false,
      export: false,
      referenceOnly: true,
    });
  });
});
