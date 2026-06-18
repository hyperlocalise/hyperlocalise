import { describe, expect, it } from "vite-plus/test";

import {
  getProviderCommentPusher,
  getProviderContentPuller,
  getProviderGlossaryMatcher,
  getProviderReviewPuller,
  getProviderTranslationMemoryMatcher,
  getProviderTranslationPusher,
  getTmsProviderAdapter,
  tmsProviderAdapters,
} from "@/lib/providers/adapters/tms-provider-adapter-registry";
import { TmsProviderAdapter } from "@/lib/providers/contracts/tms-provider-adapter";
import {
  providerSupportsCommentPush,
  providerSupportsGlossaryMatch,
  providerSupportsReviewPull,
  providerSupportsTranslationMemoryMatch,
} from "@/lib/providers/tms-provider-optional-capabilities";

describe("tmsProviderAdapters", () => {
  it("registers all known providers as TmsProviderAdapter instances", () => {
    for (const kind of ["crowdin", "phrase", "lokalise", "smartling"] as const) {
      const adapter = tmsProviderAdapters[kind];
      expect(adapter).toBeInstanceOf(TmsProviderAdapter);
      expect(adapter.kind).toBe(kind);
      expect(getTmsProviderAdapter(kind)).toBe(adapter);
    }
  });

  it("exposes core capabilities for every provider", () => {
    for (const adapter of Object.values(tmsProviderAdapters)) {
      expect(typeof adapter.fetchProjects).toBe("function");
      expect(typeof adapter.fetchFileKeys).toBe("function");
      expect(typeof adapter.fetchJobTasks).toBe("function");
      expect(typeof adapter.fetchGlossaries).toBe("function");
      expect(typeof adapter.fetchTranslationMemories).toBe("function");
      expect(typeof adapter.pullTaskContent).toBe("function");
      expect(typeof adapter.pushTranslations).toBe("function");
    }
  });
});

describe("optional adapter capabilities", () => {
  it.each([
    ["crowdin", true, true, true, true],
    ["phrase", true, false, false, true],
    ["lokalise", true, true, true, true],
    ["smartling", false, true, true, true],
  ] as const)(
    "%s review=%s comments=%s glossary=%s tm=%s",
    (provider, review, comments, glossary, tm) => {
      expect(providerSupportsReviewPull(provider)).toBe(review);
      expect(providerSupportsCommentPush(provider)).toBe(comments);
      expect(providerSupportsGlossaryMatch(provider)).toBe(glossary);
      expect(providerSupportsTranslationMemoryMatch(provider)).toBe(tm);
      expect(getProviderReviewPuller(provider) != null).toBe(review);
      expect(getProviderCommentPusher(provider) != null).toBe(comments);
      expect(getProviderGlossaryMatcher(provider) != null).toBe(glossary);
      expect(getProviderTranslationMemoryMatcher(provider) != null).toBe(tm);
    },
  );

  it("always exposes content pull and translation push for all providers", () => {
    for (const provider of ["crowdin", "phrase", "lokalise", "smartling"] as const) {
      expect(getProviderContentPuller(provider)).toBeTypeOf("function");
      expect(getProviderTranslationPusher(provider)).toBeTypeOf("function");
    }
  });
});
