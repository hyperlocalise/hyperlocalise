import { describe, expect, it } from "vite-plus/test";

import { formatTermCapabilityLabel, parseTermCapabilitySupport } from "./term-capabilities";

describe("term-capabilities", () => {
  it("returns full support for native glossaries", () => {
    expect(parseTermCapabilitySupport({}, "native")).toEqual({
      preferred: true,
      forbidden: true,
    });
    expect(formatTermCapabilityLabel(parseTermCapabilitySupport({}, "native"))).toBe(
      "Preferred · Forbidden",
    );
  });

  it("reads provider capability flags from termCapabilities", () => {
    const support = parseTermCapabilitySupport(
      { preferredTerms: true, forbiddenTerms: false },
      "external_tms",
    );

    expect(support).toEqual({ preferred: true, forbidden: false });
    expect(formatTermCapabilityLabel(support)).toBe("Preferred · No forbidden");
  });

  it("reports unknown capabilities when provider metadata is empty", () => {
    expect(formatTermCapabilityLabel(parseTermCapabilitySupport({}, "external_tms"))).toBe(
      "Capabilities unknown",
    );
  });
});
