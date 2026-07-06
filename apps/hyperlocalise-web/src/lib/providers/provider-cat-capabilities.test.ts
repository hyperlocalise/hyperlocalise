import { describe, expect, it } from "vite-plus/test";

import { supportsProviderCatFile } from "./provider-cat-capabilities";

describe("supportsProviderCatFile", () => {
  it("returns false without provider metadata", () => {
    expect(supportsProviderCatFile({})).toBe(false);
    expect(supportsProviderCatFile({ provider: null })).toBe(false);
  });

  it("supports Crowdin file resources", () => {
    expect(
      supportsProviderCatFile({
        provider: { kind: "crowdin", resourceType: "file" },
      }),
    ).toBe(true);
    expect(
      supportsProviderCatFile({
        provider: { kind: "crowdin", resourceType: "key" },
      }),
    ).toBe(false);
  });

  it("supports Phrase file and key resources", () => {
    expect(
      supportsProviderCatFile({
        provider: { kind: "phrase", resourceType: "file" },
      }),
    ).toBe(true);
    expect(
      supportsProviderCatFile({
        provider: { kind: "phrase", resourceType: "key" },
      }),
    ).toBe(true);
  });

  it("supports Lokalise file and key resources", () => {
    expect(
      supportsProviderCatFile({
        provider: { kind: "lokalise", resourceType: "file" },
      }),
    ).toBe(true);
    expect(
      supportsProviderCatFile({
        provider: { kind: "lokalise", resourceType: "key" },
      }),
    ).toBe(true);
  });

  it("returns false for providers without live CAT yet", () => {
    expect(
      supportsProviderCatFile({
        provider: { kind: "smartling", resourceType: "file" },
      }),
    ).toBe(false);
  });
});
