import { describe, expect, it } from "vite-plus/test";

import {
  getProviderCommentPusher,
  getProviderContentPuller,
  getProviderGlossaryMatcher,
  getProviderReviewPuller,
  getProviderTranslationMemoryMatcher,
  getProviderTranslationPusher,
  getTmsProviderAdapter,
  providerSupportsCommentPush,
  providerSupportsGlossaryMatch,
  providerSupportsReviewPull,
  providerSupportsTranslationMemoryMatch,
  tmsProviderAdapters,
} from "@/lib/providers/adapters/tms-provider-adapter-registry";
import { TmsProviderAdapter } from "@/lib/providers/contracts/tms-provider-adapter";
import {
  adapterSupportsCommentPush,
  adapterSupportsGlossaryMatch,
  adapterSupportsReviewPull,
  adapterSupportsTranslationMemoryMatch,
} from "@/lib/providers/tms-provider-adapter-capabilities";
import {
  providerSupportsCommentPush as clientProviderSupportsCommentPush,
  providerSupportsGlossaryMatch as clientProviderSupportsGlossaryMatch,
  providerSupportsReviewPull as clientProviderSupportsReviewPull,
  providerSupportsTranslationMemoryMatch as clientProviderSupportsTranslationMemoryMatch,
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
  it("keeps client-safe optional capability flags aligned with adapter overrides", () => {
    for (const adapter of Object.values(tmsProviderAdapters)) {
      expect(clientProviderSupportsReviewPull(adapter.kind)).toBe(
        adapterSupportsReviewPull(adapter),
      );
      expect(clientProviderSupportsCommentPush(adapter.kind)).toBe(
        adapterSupportsCommentPush(adapter),
      );
      expect(clientProviderSupportsGlossaryMatch(adapter.kind)).toBe(
        adapterSupportsGlossaryMatch(adapter),
      );
      expect(clientProviderSupportsTranslationMemoryMatch(adapter.kind)).toBe(
        adapterSupportsTranslationMemoryMatch(adapter),
      );
    }
  });

  it("derives optional capabilities from adapter method overrides", () => {
    for (const adapter of Object.values(tmsProviderAdapters)) {
      expect(providerSupportsReviewPull(adapter.kind)).toBe(adapterSupportsReviewPull(adapter));
      expect(providerSupportsCommentPush(adapter.kind)).toBe(adapterSupportsCommentPush(adapter));
      expect(providerSupportsGlossaryMatch(adapter.kind)).toBe(
        adapterSupportsGlossaryMatch(adapter),
      );
      expect(providerSupportsTranslationMemoryMatch(adapter.kind)).toBe(
        adapterSupportsTranslationMemoryMatch(adapter),
      );
      expect(getProviderReviewPuller(adapter.kind) != null).toBe(
        adapterSupportsReviewPull(adapter),
      );
      expect(getProviderCommentPusher(adapter.kind) != null).toBe(
        adapterSupportsCommentPush(adapter),
      );
      expect(getProviderGlossaryMatcher(adapter.kind) != null).toBe(
        adapterSupportsGlossaryMatch(adapter),
      );
      expect(getProviderTranslationMemoryMatcher(adapter.kind) != null).toBe(
        adapterSupportsTranslationMemoryMatch(adapter),
      );
    }
  });

  it("always exposes content pull and translation push for all providers", () => {
    for (const provider of ["crowdin", "phrase", "lokalise", "smartling"] as const) {
      expect(getProviderContentPuller(provider)).toBeTypeOf("function");
      expect(getProviderTranslationPusher(provider)).toBeTypeOf("function");
    }
  });
});
