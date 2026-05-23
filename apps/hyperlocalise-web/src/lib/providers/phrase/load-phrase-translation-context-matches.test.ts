import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { TranslationContextProjectRecord } from "@/lib/translation/assemble-translation-context";

const { mockDbSelect, mockDecrypt, mockPhraseClient } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDecrypt: vi.fn(() => "secret-token"),
  mockPhraseClient: {
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
  },
}));

vi.mock("@/lib/security/provider-credential-crypto", () => ({
  decryptProviderCredential: mockDecrypt,
}));

vi.mock("./phrase-tms-api", () => ({
  PhraseTmsApiClient: class {
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
      })),
    })),
  };
}

describe("loadPhraseTranslationContextMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPhraseClient.searchJobTermBasesInText.mockResolvedValue([]);
  });

  it("returns empty glossary terms when external job uid is missing", async () => {
    const result = await loadPhraseTranslationContextMatches({
      project: phraseProject(),
      externalJobUid: null,
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      sourceText: "Hello",
    });

    expect(result).toEqual({ glossaryTerms: [] });
    expect(mockPhraseClient.searchJobTermBasesInText).not.toHaveBeenCalled();
  });

  it("returns empty glossary terms for non-phrase projects", async () => {
    const result = await loadPhraseTranslationContextMatches({
      project: phraseProject({ externalProviderKind: "crowdin" }),
      externalJobUid: "job-1",
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      sourceText: "Hello",
    });

    expect(result).toEqual({ glossaryTerms: [] });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns empty glossary terms when provider credential is missing", async () => {
    mockDbSelect.mockReturnValueOnce(createSelectBuilder([]));

    const result = await loadPhraseTranslationContextMatches({
      project: phraseProject(),
      externalJobUid: "job-1",
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      sourceText: "Hello",
    });

    expect(result).toEqual({ glossaryTerms: [] });
    expect(mockPhraseClient.searchJobTermBasesInText).not.toHaveBeenCalled();
  });

  it("normalizes live term-base hits", async () => {
    const credential = {
      id: "cred_1",
      encryptionAlgorithm: "aes-256-gcm",
      keyVersion: 1,
      ciphertext: "cipher",
      iv: "iv",
      authTag: "tag",
      baseUrl: "https://cloud.memsource.com/web",
    };

    mockDbSelect.mockReturnValueOnce(createSelectBuilder([credential]));

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

    expect(mockPhraseClient.searchJobTermBasesInText).toHaveBeenCalledWith({
      projectUid: "phrase-project-uid",
      jobUid: "job-1",
      text: "Hello",
    });
    expect(result.glossaryTerms).toHaveLength(1);
    expect(result.glossaryTerms[0]?.glossaryId).toBe("phrase:tb-1");
  });
});
