import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  getProviderCommentPusher,
  getProviderContentPuller,
  getProviderGlossaryMatcher,
  getProviderReviewPuller,
  getProviderTranslationMemoryMatcher,
  getProviderTranslationPusher,
  getTmsProvider,
  listTmsProviderParityRows,
  providerSupportsCommentPush,
  providerSupportsGlossaryMatch,
  providerSupportsReviewPull,
  providerSupportsTranslationMemoryMatch,
  tmsProviders,
} from "@/lib/providers/adapters/tms-provider-registry";
import {
  TmsProvider,
  tmsProviderFeatureIds,
  type TmsProviderFeatureId,
} from "@/lib/providers/contracts/tms-provider";

const providerKinds = ["crowdin", "phrase", "lokalise", "smartling"] as const;

function providerOverrides(
  provider: TmsProvider,
  methodName:
    | "pullReview"
    | "pushComments"
    | "searchGlossaryMatches"
    | "searchTranslationMemoryMatches",
) {
  return provider[methodName] !== TmsProvider.prototype[methodName];
}

describe("tmsProviders", () => {
  it("registers all known providers as TmsProvider instances", () => {
    for (const kind of providerKinds) {
      const provider = tmsProviders[kind];

      expect(provider).toBeInstanceOf(TmsProvider);
      expect(provider.kind).toBe(kind);
      expect(getTmsProvider(kind)).toBe(provider);
    }
  });

  it("exposes core operations for every provider", () => {
    for (const provider of Object.values(tmsProviders)) {
      expect(typeof provider.fetchProjects).toBe("function");
      expect(typeof provider.fetchFileKeys).toBe("function");
      expect(typeof provider.fetchJobTasks).toBe("function");
      expect(typeof provider.fetchGlossaries).toBe("function");
      expect(typeof provider.fetchTranslationMemories).toBe("function");
      expect(typeof provider.pullTaskContent).toBe("function");
      expect(typeof provider.uploadSourceFile).toBe("function");
      expect(typeof provider.pushTranslations).toBe("function");
    }
  });

  it("declares every feature state in each provider class", () => {
    for (const provider of Object.values(tmsProviders)) {
      expect(Object.keys(provider.features).sort()).toEqual([...tmsProviderFeatureIds].sort());
    }
  });

  it("generates one parity row per provider feature", () => {
    const rows = listTmsProviderParityRows();

    expect(rows).toHaveLength(providerKinds.length * tmsProviderFeatureIds.length);
    for (const providerKind of providerKinds) {
      expect(rows.filter((row) => row.providerKind === providerKind)).toHaveLength(
        tmsProviderFeatureIds.length,
      );
    }
  });
});

describe("optional provider operations", () => {
  it("keeps capability helpers aligned with concrete provider method overrides", () => {
    for (const provider of Object.values(tmsProviders)) {
      expect(providerSupportsReviewPull(provider.kind)).toBe(
        provider.features["review.pull"].state === "implemented" &&
          providerOverrides(provider, "pullReview"),
      );
      expect(providerSupportsCommentPush(provider.kind)).toBe(
        providerOverrides(provider, "pushComments"),
      );
      expect(providerSupportsGlossaryMatch(provider.kind)).toBe(
        provider.features["glossary.search"].state === "implemented" &&
          providerOverrides(provider, "searchGlossaryMatches"),
      );
      expect(providerSupportsTranslationMemoryMatch(provider.kind)).toBe(
        provider.features["translation_memory.search"].state === "implemented" &&
          providerOverrides(provider, "searchTranslationMemoryMatches"),
      );
    }
  });

  it.each([
    ["review.pull", "pullReview"],
    ["comments.write", "pushComments"],
    ["glossary.search", "searchGlossaryMatches"],
    ["translation_memory.search", "searchTranslationMemoryMatches"],
  ] as const)(
    "implemented %s features have a concrete %s method",
    (featureId: TmsProviderFeatureId, methodName) => {
      for (const provider of Object.values(tmsProviders)) {
        if (provider.features[featureId].state !== "implemented") {
          continue;
        }

        expect(providerOverrides(provider, methodName)).toBe(true);
      }
    },
  );

  it("returns optional operation wrappers only when implemented", () => {
    for (const provider of Object.values(tmsProviders)) {
      expect(getProviderReviewPuller(provider.kind) != null).toBe(
        providerSupportsReviewPull(provider.kind),
      );
      expect(getProviderCommentPusher(provider.kind) != null).toBe(
        providerSupportsCommentPush(provider.kind),
      );
      expect(getProviderGlossaryMatcher(provider.kind) != null).toBe(
        providerSupportsGlossaryMatch(provider.kind),
      );
      expect(getProviderTranslationMemoryMatcher(provider.kind) != null).toBe(
        providerSupportsTranslationMemoryMatch(provider.kind),
      );
    }
  });

  it("always exposes content pull and translation push for all providers", () => {
    for (const provider of providerKinds) {
      expect(getProviderContentPuller(provider)).toBeTypeOf("function");
      expect(getProviderTranslationPusher(provider)).toBeTypeOf("function");
    }
  });
});

describe("provider class boundaries", () => {
  it("keeps Crowdin provider behavior inside the concrete provider class", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/providers/adapters/crowdin/crowdin-provider.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/fetchCrowdin|pullCrowdin|pushCrowdin|uploadCrowdin|searchCrowdin/);
    expect(source).not.toContain("/smartling/");
    expect(source).not.toContain("crowdin-comment-write-back");
    expect(source).not.toContain("crowdin-project-logo");
    expect(source).not.toContain("crowdin-resource-scope");
    expect(source).not.toContain("crowdin-review-normalize");
    expect(source).not.toContain("crowdin-task-locales");
    expect(source.match(/new CrowdinApiClient/g)).toHaveLength(1);
  });
});
