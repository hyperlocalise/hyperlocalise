import { describe, expect, it } from "vite-plus/test";

import { normalizeProviderGlossaryTermFlags } from "./normalize-provider-glossary-term";

describe("normalizeProviderGlossaryTermFlags", () => {
  it("marks Crowdin preferred terms as non-forbidden", () => {
    expect(normalizeProviderGlossaryTermFlags({ status: "preferred" })).toEqual({
      forbidden: false,
    });
  });

  it("marks Crowdin forbidden and not-recommended terms as forbidden", () => {
    expect(normalizeProviderGlossaryTermFlags({ status: "forbidden" })).toEqual({
      forbidden: true,
    });
    expect(normalizeProviderGlossaryTermFlags({ status: "not recommended" })).toEqual({
      forbidden: true,
    });
  });

  it("honors explicit Lokalise forbidden flags over status text", () => {
    expect(
      normalizeProviderGlossaryTermFlags({
        status: "preferred",
        forbidden: true,
      }),
    ).toEqual({ forbidden: true });
    expect(
      normalizeProviderGlossaryTermFlags({
        status: "forbidden",
        forbidden: false,
      }),
    ).toEqual({ forbidden: false });
  });

  it("defaults unknown statuses to non-forbidden preferred terms", () => {
    expect(normalizeProviderGlossaryTermFlags({ status: "observed" })).toEqual({
      forbidden: false,
    });
    expect(normalizeProviderGlossaryTermFlags({})).toEqual({ forbidden: false });
  });
});
