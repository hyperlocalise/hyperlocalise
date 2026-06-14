import { describe, expect, it } from "vite-plus/test";

import {
  collectEntryLocaleKeys,
  contentfulLocaleLanguage,
  normalizeContentfulLocaleTag,
  resolveContentfulLocaleKey,
  resolveContentfulLocaleKeys,
  resolveContentfulSourceLocale,
} from "./contentful-locale";
import type { ContentfulEntry } from "./types";

describe("contentful locale resolution", () => {
  it("normalizes locale tags for comparison", () => {
    expect(normalizeContentfulLocaleTag("en_US")).toBe("en-us");
    expect(contentfulLocaleLanguage("en-US")).toBe("en");
  });

  it("matches exact locale tags case-insensitively", () => {
    expect(resolveContentfulLocaleKey("en-us", ["en-US", "fr-FR"])).toBe("en-US");
  });

  it("matches language-only configured locales to regional entry locales", () => {
    expect(resolveContentfulLocaleKey("en", ["en-US", "fr-FR"])).toBe("en-US");
    expect(resolveContentfulLocaleKey("fr", ["en-US", "fr-FR"])).toBe("fr-FR");
  });

  it("prefers the space default locale when multiple regional variants match", () => {
    expect(
      resolveContentfulLocaleKey("en", ["en-GB", "en-US"], {
        defaultLocale: "en-US",
      }),
    ).toBe("en-US");
  });

  it("resolves configured source and target locales against space and entry locales", () => {
    const entry: ContentfulEntry = {
      sys: { id: "entry-1", version: 1 },
      fields: {
        title: {
          "en-US": "Hello",
        },
      },
    };

    expect(collectEntryLocaleKeys(entry)).toEqual(["en-US"]);
    expect(
      resolveContentfulSourceLocale({
        preferredSourceLocale: "en",
        spaceLocaleCodes: ["en-US", "fr-FR"],
        entryLocaleKeys: collectEntryLocaleKeys(entry),
        defaultLocale: "en-US",
      }),
    ).toBe("en-US");
    expect(
      resolveContentfulLocaleKeys({
        preferredLocales: ["fr", "de"],
        spaceLocaleCodes: ["en-US", "fr-FR", "de-DE"],
        entryLocaleKeys: collectEntryLocaleKeys(entry),
        defaultLocale: "en-US",
      }),
    ).toEqual(["fr-FR", "de-DE"]);
  });
});
