import { describe, expect, it } from "vite-plus/test";

import {
  mergeGlossaryMatches,
  normalizeGlossaryTermStatus,
  normalizeProviderGlossaryMatch,
  normalizeSyncedDatabaseGlossaryMatch,
  toAgentRunGlossaryMatchUsage,
  toContextGlossaryMatch,
} from "./glossary-match";

describe("normalizeGlossaryTermStatus", () => {
  it("marks preferred Crowdin terms as non-forbidden", () => {
    expect(normalizeGlossaryTermStatus({ status: "preferred" })).toEqual({
      forbidden: false,
      preferred: true,
    });
  });

  it("marks forbidden and not-recommended terms as forbidden and not preferred", () => {
    expect(normalizeGlossaryTermStatus({ status: "forbidden" })).toEqual({
      forbidden: true,
      preferred: false,
    });
    expect(normalizeGlossaryTermStatus({ status: "not recommended" })).toEqual({
      forbidden: true,
      preferred: false,
    });
  });

  it("honors explicit forbidden flags over status text", () => {
    expect(
      normalizeGlossaryTermStatus({
        status: "preferred",
        forbidden: true,
      }),
    ).toEqual({ forbidden: true, preferred: false });
    expect(
      normalizeGlossaryTermStatus({
        status: "forbidden",
        forbidden: false,
      }),
    ).toEqual({ forbidden: false, preferred: true });
  });
});

describe("normalizeProviderGlossaryMatch", () => {
  it("normalizes Crowdin concordance fields into a provider-neutral match", () => {
    const match = normalizeProviderGlossaryMatch({
      sourceTerm: "Save",
      targetTerm: "Enregistrer",
      sourceLocale: "en",
      targetLocale: "fr",
      providerKind: "crowdin",
      resourceId: "glossary-1",
      externalResourceId: "42",
      externalTermId: "99",
      glossaryName: "Product glossary",
      rank: 0.95,
      status: { status: "preferred" },
    });

    expect(match).toMatchObject({
      glossaryId: "glossary-1",
      glossaryName: "Product glossary",
      sourceTerm: "Save",
      targetTerm: "Enregistrer",
      matchSource: "live_provider",
      providerKind: "crowdin",
      resourceId: "glossary-1",
      externalResourceId: "42",
      termStatus: { forbidden: false, preferred: true },
    });
  });
});

describe("normalizeSyncedDatabaseGlossaryMatch", () => {
  it("marks synced database entries with resource metadata", () => {
    const match = normalizeSyncedDatabaseGlossaryMatch({
      id: "term-1",
      glossaryId: "glossary-1",
      glossaryName: "Synced glossary",
      sourceTerm: "Cancel",
      targetTerm: "Annuler",
      sourceLocale: "en",
      targetLocale: "fr",
      description: null,
      forbidden: true,
      caseSensitive: false,
      rank: 1,
      providerKind: "crowdin",
      externalResourceId: "glossary-ext-1",
      externalTermId: "term-ext-1",
    });

    expect(match.matchSource).toBe("synced_database");
    expect(match.termStatus).toEqual({ forbidden: true, preferred: false });
  });
});

describe("mergeGlossaryMatches", () => {
  it("prefers synced database matches over live provider duplicates", () => {
    const synced = normalizeSyncedDatabaseGlossaryMatch({
      id: "term-1",
      glossaryId: "glossary-1",
      glossaryName: "Synced glossary",
      sourceTerm: "Hello",
      targetTerm: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      description: null,
      forbidden: false,
      caseSensitive: false,
      rank: 1,
      providerKind: "crowdin",
      externalResourceId: "42",
      externalTermId: "1",
    });

    const live = normalizeProviderGlossaryMatch({
      sourceTerm: "Hello",
      targetTerm: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      providerKind: "crowdin",
      resourceId: "glossary-1",
      externalResourceId: "42",
      glossaryName: "Synced glossary",
      status: { status: "preferred" },
    });

    const merged = mergeGlossaryMatches([live, synced], 5);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.matchSource).toBe("synced_database");
  });
});

describe("context and agent run projections", () => {
  it("projects normalized matches for prompts and run output", () => {
    const normalized = normalizeSyncedDatabaseGlossaryMatch({
      id: "term-1",
      glossaryId: "glossary-1",
      glossaryName: "Synced glossary",
      sourceTerm: "Hello",
      targetTerm: "Bonjour",
      sourceLocale: "en",
      targetLocale: "fr",
      description: "Greeting",
      forbidden: false,
      caseSensitive: true,
      rank: 1,
      providerKind: "crowdin",
      externalResourceId: "42",
      externalTermId: "1",
    });

    expect(toContextGlossaryMatch(normalized)).toMatchObject({
      matchSource: "synced_database",
      resourceId: "glossary-1",
      externalResourceId: "42",
      caseSensitive: true,
    });

    expect(toAgentRunGlossaryMatchUsage(normalized)).toMatchObject({
      matchSource: "synced_database",
      preferred: true,
      forbidden: false,
      glossaryName: "Synced glossary",
    });
  });
});
