/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
