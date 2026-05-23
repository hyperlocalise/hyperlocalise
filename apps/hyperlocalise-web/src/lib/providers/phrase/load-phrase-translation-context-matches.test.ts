import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { TranslationContextProjectRecord } from "@/lib/translation/assemble-translation-context";

const { mockDbSelect, mockDecrypt, mockPhraseClient } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDecrypt: vi.fn(() => "secret-token"),
  mockPhraseClient: {
    searchJobTranslationMemorySegment: vi.fn(),
    searchJobTermBasesInText: vi.fn(),
  },
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: mockDbSelect,
  },
  schema: {
    organizationExternalTmsProviderCredentials: {
      id: "id",
      organizationId: "organizationId",
      providerKind: "providerKind",
    },
    projectMemories: { projectId: "projectId", memoryId: "memoryId" },
    memories: { id: "id", externalMemoryId: "externalMemoryId" },
  },
}));

vi.mock("@/lib/security/provider-credential-crypto", () => ({
  decryptProviderCredential: mockDecrypt,
}));

vi.mock("./phrase-tms-api", () => ({
  PhraseTmsApiClient: class {
    searchJobTranslationMemorySegment = mockPhraseClient.searchJobTranslationMemorySegment;
    searchJobTermBasesInText = mockPhraseClient.searchJobTermBasesInText;
  },
}));

import { loadPhraseTranslationContextMatches } from "./load-phrase-translation-context-matches";

function phraseProject(
  overrides: Partial<TranslationContextProjectRecord> = {},
): TranslationContextProjectRecord {
  return {
    id: "project_1",
    name: "Phrase project",
    translationContext: "",
    organizationId: "org_1",
    source: "external_tms",
    externalProviderKind: "phrase",
    externalProjectId: "phrase-project-uid",
    externalProviderCredentialId: "cred_1",
    providerMetadata: { phraseTmsProjectUid: "phrase-project-uid" },
    ...overrides,
  };
}

function createSelectBuilder(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => result),
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => result),
        })),
      })),
      innerJoin: vi.fn(() => ({
        where: vi.fn(async () => result),
      })),
    })),
  };
}

describe("loadPhraseTranslationContextMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPhraseClient.searchJobTranslationMemorySegment.mockResolvedValue([]);
    mockPhraseClient.searchJobTermBasesInText.mockResolvedValue([]);
  });

  it("returns empty matches when external job uid is missing", async () => {
    const result = await loadPhraseTranslationContextMatches({
      project: phraseProject(),
      externalJobUid: null,
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      sourceText: "Hello",
    });

    expect(result).toEqual({ glossaryTerms: [], translationMemoryMatches: [] });
    expect(mockPhraseClient.searchJobTranslationMemorySegment).not.toHaveBeenCalled();
  });

  it("returns empty matches for non-phrase projects", async () => {
    const result = await loadPhraseTranslationContextMatches({
      project: phraseProject({ externalProviderKind: "crowdin" }),
      externalJobUid: "job-1",
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      sourceText: "Hello",
    });

    expect(result).toEqual({ glossaryTerms: [], translationMemoryMatches: [] });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns empty matches when provider credential is missing", async () => {
    mockDbSelect.mockReturnValueOnce(createSelectBuilder([]));

    const result = await loadPhraseTranslationContextMatches({
      project: phraseProject(),
      externalJobUid: "job-1",
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      sourceText: "Hello",
    });

    expect(result).toEqual({ glossaryTerms: [], translationMemoryMatches: [] });
    expect(mockPhraseClient.searchJobTranslationMemorySegment).not.toHaveBeenCalled();
  });

  it("normalizes live TM and term-base hits for attached memories", async () => {
    const credential = {
      id: "cred_1",
      encryptionAlgorithm: "aes-256-gcm",
      keyVersion: 1,
      ciphertext: "cipher",
      iv: "iv",
      authTag: "tag",
      baseUrl: "https://cloud.memsource.com/web",
    };

    mockDbSelect
      .mockReturnValueOnce(createSelectBuilder([credential]))
      .mockReturnValueOnce(
        createSelectBuilder([{ id: "memory_local_1", externalMemoryId: "tm-uid-1" }]),
      );

    mockPhraseClient.searchJobTranslationMemorySegment.mockResolvedValue([
      {
        transMemoryUid: "tm-uid-1",
        transMemoryName: "Product TM",
        sourceText: "Hello",
        targetText: "Bonjour",
        targetLocale: "fr-FR",
        score: 0.9,
      },
      {
        transMemoryUid: "tm-not-synced",
        sourceText: "Hello",
        targetText: "Hola",
        targetLocale: "es-ES",
        score: 0.7,
      },
    ]);
    mockPhraseClient.searchJobTermBasesInText.mockResolvedValue([
      {
        termBaseUid: "tb-1",
        termBaseName: "Brand",
        sourceTerm: "Hello",
        targetTerm: "Bonjour",
        targetLocale: "fr-FR",
      },
    ]);

    const result = await loadPhraseTranslationContextMatches({
      project: phraseProject(),
      externalJobUid: "job-1",
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      sourceText: "Hello",
    });

    expect(mockPhraseClient.searchJobTranslationMemorySegment).toHaveBeenCalledWith({
      projectUid: "phrase-project-uid",
      jobUid: "job-1",
      segment: "Hello",
    });
    expect(result.translationMemoryMatches).toHaveLength(1);
    expect(result.translationMemoryMatches[0]?.memoryId).toBe("memory_local_1");
    expect(result.glossaryTerms).toHaveLength(1);
    expect(result.glossaryTerms[0]?.glossaryId).toBe("phrase:tb-1");
  });
});
