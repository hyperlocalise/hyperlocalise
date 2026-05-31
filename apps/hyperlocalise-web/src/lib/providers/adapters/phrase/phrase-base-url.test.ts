import { describe, expect, it } from "vite-plus/test";

import { PHRASE_EU_BASE_URL, PHRASE_US_BASE_URL, resolvePhraseBaseUrl } from "./phrase-base-url";

describe("resolvePhraseBaseUrl", () => {
  it("defaults to the EU datacenter when region and baseUrl are omitted", () => {
    expect(resolvePhraseBaseUrl({})).toBe(PHRASE_EU_BASE_URL);
  });

  it("selects the US datacenter when region is us", () => {
    expect(resolvePhraseBaseUrl({ region: "us" })).toBe(PHRASE_US_BASE_URL);
    expect(resolvePhraseBaseUrl({ region: "USA" })).toBe(PHRASE_US_BASE_URL);
  });

  it("selects the EU datacenter when region is eu", () => {
    expect(resolvePhraseBaseUrl({ region: "eu" })).toBe(PHRASE_EU_BASE_URL);
    expect(resolvePhraseBaseUrl({ region: "Europe" })).toBe(PHRASE_EU_BASE_URL);
  });

  it("prefers an explicit baseUrl over region defaults", () => {
    expect(
      resolvePhraseBaseUrl({
        region: "us",
        baseUrl: "https://api.phrase.test/v2/",
      }),
    ).toBe("https://api.phrase.test/v2");
  });
});
