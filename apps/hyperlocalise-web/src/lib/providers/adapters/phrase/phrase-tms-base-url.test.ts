import { describe, expect, it } from "vite-plus/test";

import { PHRASE_TMS_DEFAULT_BASE_URL, resolvePhraseTmsBaseUrl } from "./phrase-tms-base-url";

describe("resolvePhraseTmsBaseUrl", () => {
  it("defaults to the Phrase TMS host", () => {
    expect(resolvePhraseTmsBaseUrl({})).toBe(PHRASE_TMS_DEFAULT_BASE_URL);
  });

  it("uses explicit memsource base URLs", () => {
    expect(resolvePhraseTmsBaseUrl({ baseUrl: "https://cloud.memsource.com/web/" })).toBe(
      "https://cloud.memsource.com/web",
    );
  });

  it("falls back when a Strings API base URL is configured", () => {
    expect(resolvePhraseTmsBaseUrl({ baseUrl: "https://api.phrase.com/v2" })).toBe(
      PHRASE_TMS_DEFAULT_BASE_URL,
    );
  });
});
