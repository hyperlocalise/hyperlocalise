import { describe, expect, it } from "vite-plus/test";

import {
  countTranslationMemoryMatchesInUsage,
  formatTranslationMemoryMatchSourceLabel,
  formatTranslationMemoryResourceLabel,
  parseTranslationMemoryUsageFromOutputSummary,
} from "./agent-run-translation-memory";

describe("parseTranslationMemoryUsageFromOutputSummary", () => {
  it("parses run-level translation memory usage", () => {
    const usage = parseTranslationMemoryUsageFromOutputSummary({
      translationMemoryUsage: [
        {
          externalStringId: "s1",
          key: "welcome.title",
          matches: [
            {
              memoryId: "mem-1",
              memoryName: "Product TM",
              sourceText: "Hello",
              targetText: "Bonjour",
              targetLocale: "fr",
              matchScore: 100,
              matchSource: "synced_database",
              providerKind: "crowdin",
              resourceId: "mem-1",
              externalResourceId: "42",
            },
          ],
        },
      ],
    });

    expect(usage).toHaveLength(1);
    expect(countTranslationMemoryMatchesInUsage(usage)).toBe(1);
  });

  it("returns null when usage is missing or empty", () => {
    expect(parseTranslationMemoryUsageFromOutputSummary(undefined)).toBeNull();
    expect(parseTranslationMemoryUsageFromOutputSummary({})).toBeNull();
    expect(parseTranslationMemoryUsageFromOutputSummary({ translationMemoryUsage: [] })).toBeNull();
  });
});

describe("formatTranslationMemoryMatchSourceLabel", () => {
  it("labels synced and live provider sources", () => {
    expect(
      formatTranslationMemoryMatchSourceLabel({
        matchSource: "synced_database",
        providerKind: "crowdin",
      }),
    ).toBe("Synced database");

    expect(
      formatTranslationMemoryMatchSourceLabel({
        matchSource: "live_provider",
        providerKind: "crowdin",
      }),
    ).toBe("Live crowdin");
  });

  it("includes external resource id in resource label when present", () => {
    expect(
      formatTranslationMemoryResourceLabel({
        memoryId: "mem-1",
        memoryName: "TM",
        sourceText: "A",
        targetText: "B",
        targetLocale: "fr",
        matchScore: 90,
        matchSource: "live_provider",
        providerKind: "crowdin",
        resourceId: "mem-1",
        externalResourceId: "99",
      }),
    ).toContain("TM 99");
  });
});
