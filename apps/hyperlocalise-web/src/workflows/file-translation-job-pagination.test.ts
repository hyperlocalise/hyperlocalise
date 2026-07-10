import { describe, expect, it } from "vite-plus/test";

import { parseDeferredByLimit } from "./file-translation-pagination";

describe("parseDeferredByLimit", () => {
  it("reads deferred_by_limit from hl run stdout", () => {
    expect(
      parseDeferredByLimit(
        "planned_total=3000 skipped_by_lock=0 executable_total=1000 deferred_by_limit=2000\nsucceeded=1000 failed=0\n",
      ),
    ).toBe(2000);
  });

  it("returns 0 when the marker is absent", () => {
    expect(parseDeferredByLimit("planned_total=1 executable_total=1\n")).toBe(0);
  });

  it("returns 0 for deferred_by_limit=0", () => {
    expect(parseDeferredByLimit("deferred_by_limit=0\n")).toBe(0);
  });
});
