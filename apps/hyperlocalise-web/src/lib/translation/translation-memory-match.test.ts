import { describe, expect, it } from "vite-plus/test";

import {
  mergeTranslationMemoryMatches,
  normalizeProviderTranslationMemoryMatch,
  normalizeSyncedDatabaseTranslationMemoryMatch,
  toAgentRunTranslationMemoryMatchUsage,
  toContextTranslationMemoryMatch,
} from "./translation-memory-match";

describe("normalizeProviderTranslationMemoryMatch", () => {
  it("normalizes Crowdin concordance fields into a provider-neutral match", () => {
    const match = normalizeProviderTranslationMemoryMatch({
      sourceText: "Hello",
      targetText: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      matchScore: 92,
      providerKind: "crowdin",
      resourceId: "memory-1",
      externalResourceId: "42",
      externalSegmentId: "99",
      memoryName: "Product TM",
      rank: 0.95,
    });

    expect(match).toMatchObject({
      memoryId: "memory-1",
      memoryName: "Product TM",
      sourceText: "Hello",
      targetText: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      matchScore: 92,
      matchSource: "live_provider",
      providerKind: "crowdin",
      resourceId: "memory-1",
      externalResourceId: "42",
      externalSegmentId: "99",
      rank: 0.95,
    });
  });

  it("clamps match scores to 0-100", () => {
    const match = normalizeProviderTranslationMemoryMatch({
      sourceText: "A",
      targetText: "B",
      sourceLocale: "en",
      targetLocale: "fr",
      matchScore: 150,
      providerKind: "crowdin",
      resourceId: "memory-1",
      memoryName: "TM",
    });

    expect(match.matchScore).toBe(100);
  });
});

describe("normalizeSyncedDatabaseTranslationMemoryMatch", () => {
  it("marks synced database entries with resource metadata", () => {
    const match = normalizeSyncedDatabaseTranslationMemoryMatch({
      id: "entry-1",
      memoryId: "memory-1",
      memoryName: "Synced TM",
      sourceText: "Save",
      targetText: "Enregistrer",
      sourceLocale: "en",
      targetLocale: "fr",
      matchScore: 100,
      provenance: "sync",
      rank: 1,
      providerKind: "phrase",
      externalResourceId: "tm-phrase-1",
      externalSegmentId: "seg-1",
    });

    expect(match.matchSource).toBe("synced_database");
    expect(match.resourceId).toBe("memory-1");
    expect(match.externalResourceId).toBe("tm-phrase-1");
  });
});

describe("mergeTranslationMemoryMatches", () => {
  it("prefers synced database matches over live provider duplicates", () => {
    const synced = normalizeSyncedDatabaseTranslationMemoryMatch({
      id: "entry-1",
      memoryId: "memory-1",
      memoryName: "Synced TM",
      sourceText: "Hello",
      targetText: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      matchScore: 100,
      provenance: "sync",
      rank: 1,
      providerKind: "crowdin",
      externalResourceId: "42",
      externalSegmentId: "1",
    });

    const live = normalizeProviderTranslationMemoryMatch({
      sourceText: "Hello",
      targetText: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      matchScore: 80,
      providerKind: "crowdin",
      resourceId: "memory-1",
      externalResourceId: "42",
      memoryName: "Synced TM",
    });

    const merged = mergeTranslationMemoryMatches([live, synced], 5);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.matchSource).toBe("synced_database");
  });
});

describe("context and agent run projections", () => {
  it("projects normalized matches for prompts and run output", () => {
    const normalized = normalizeSyncedDatabaseTranslationMemoryMatch({
      id: "entry-1",
      memoryId: "memory-1",
      memoryName: "Synced TM",
      sourceText: "Hello",
      targetText: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      matchScore: 100,
      provenance: "sync",
      rank: 1,
      providerKind: "crowdin",
      externalResourceId: "42",
      externalSegmentId: "1",
    });

    expect(toContextTranslationMemoryMatch(normalized)).toMatchObject({
      matchSource: "synced_database",
      resourceId: "memory-1",
      externalResourceId: "42",
    });

    expect(toAgentRunTranslationMemoryMatchUsage(normalized)).toMatchObject({
      matchSource: "synced_database",
      resourceId: "memory-1",
      memoryName: "Synced TM",
    });
  });
});
