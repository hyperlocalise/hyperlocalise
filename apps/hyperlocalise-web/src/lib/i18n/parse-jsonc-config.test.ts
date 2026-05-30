import { describe, expect, it } from "vite-plus/test";

import { normalizeJsonc } from "./parse-jsonc-config";

describe("normalizeJsonc", () => {
  it("strips comments and trailing commas", () => {
    const normalized = normalizeJsonc(`{
      // comment
      "locales": { "source": "en", "targets": ["es",], },
    }`);

    expect(JSON.parse(normalized)).toEqual({
      locales: { source: "en", targets: ["es"] },
    });
  });
});
