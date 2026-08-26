/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  crowdinClientOptions,
  lokaliseClientOptions,
  loadCrowdinProjectCredentialMock,
  loadLokaliseProjectCredentialMock,
  resolveExternalTmsSecretMaterialForActorMock,
  searchCrowdinCatConcordanceMock,
  searchLokaliseCatConcordanceMock,
} = vi.hoisted(() => ({
  crowdinClientOptions: [] as unknown[],
  lokaliseClientOptions: [] as unknown[],
  loadCrowdinProjectCredentialMock: vi.fn(),
  loadLokaliseProjectCredentialMock: vi.fn(),
  resolveExternalTmsSecretMaterialForActorMock: vi.fn(),
  searchCrowdinCatConcordanceMock: vi.fn(),
  searchLokaliseCatConcordanceMock: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-auth", () => ({
  crowdinAuth: {
    loadProjectCredential: (...args: unknown[]) => loadCrowdinProjectCredentialMock(...args),
  },
}));

vi.mock("@/lib/providers/adapters/lokalise/lokalise-auth", () => ({
  lokaliseAuth: {
    loadProjectCredential: (...args: unknown[]) => loadLokaliseProjectCredentialMock(...args),
  },
}));

vi.mock("@/lib/providers/shared/tms-provider-content", () => ({
  resolveExternalTmsSecretMaterialForActor: (...args: unknown[]) =>
    resolveExternalTmsSecretMaterialForActorMock(...args),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", () => ({
  CrowdinApiClient: class MockCrowdinApiClient {
    constructor(options: unknown) {
      crowdinClientOptions.push(options);
    }
  },
}));

vi.mock("@/lib/providers/adapters/lokalise/lokalise-api", () => ({
  LokaliseApiClient: class MockLokaliseApiClient {
    constructor(options: unknown) {
      lokaliseClientOptions.push(options);
    }
  },
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-provider", () => ({
  crowdinTmsProvider: {
    searchCatConcordance: (...args: unknown[]) => searchCrowdinCatConcordanceMock(...args),
  },
}));

vi.mock("@/lib/providers/adapters/lokalise/lokalise-provider", () => ({
  lokaliseTmsProvider: {
    searchCatConcordance: (...args: unknown[]) => searchLokaliseCatConcordanceMock(...args),
  },
}));

import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live";
import { loadCatSegmentConcordance } from "./cat";

const baseCredential = {
  id: "cred_1",
  organizationId: "org_1",
  providerKind: "crowdin" as const,
  authMode: "oauth",
  encryptionAlgorithm: "aes-256-gcm",
  keyVersion: 1,
  ciphertext: "cipher",
  iv: "iv",
  authTag: "tag",
  baseUrl: "https://acme.crowdin.com/api/v2",
};

const lokaliseCredential = {
  ...baseCredential,
  providerKind: "lokalise" as const,
  baseUrl: "https://api.lokalise.com/api2",
};

describe("loadCatSegmentConcordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crowdinClientOptions.length = 0;
    lokaliseClientOptions.length = 0;
    loadCrowdinProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    loadLokaliseProjectCredentialMock.mockResolvedValue({
      externalProjectId: "proj.123",
      credential: lokaliseCredential,
    });
    resolveExternalTmsSecretMaterialForActorMock.mockResolvedValue("user-token");
    searchCrowdinCatConcordanceMock.mockResolvedValue({
      glossaryTerms: [],
      translationMemoryMatches: [],
    });
    searchLokaliseCatConcordanceMock.mockResolvedValue({
      glossaryTerms: [],
      translationMemoryMatches: [],
    });
  });

  it("resolves per-user Crowdin credentials for live concordance", async () => {
    await loadCatSegmentConcordance({
      organizationId: "org_1",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      actorUserId: "user_1",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
    });

    expect(resolveExternalTmsSecretMaterialForActorMock).toHaveBeenCalledWith({
      credential: baseCredential,
      organizationId: "org_1",
      actorUserId: "user_1",
    });
    expect(crowdinClientOptions).toEqual([
      {
        token: "user-token",
        baseUrl: "https://acme.crowdin.com/api/v2",
      },
    ]);
    expect(searchCrowdinCatConcordanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProjectId: "42",
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello",
      }),
    );
  });

  it("throws a user-facing error when Crowdin per-user auth is missing", async () => {
    resolveExternalTmsSecretMaterialForActorMock.mockRejectedValue(
      new Error("crowdin_user_connection_required"),
    );

    await expect(
      loadCatSegmentConcordance({
        organizationId: "org_1",
        projectId: "ext:crowdin:42",
        providerKind: "crowdin",
        actorUserId: "user_1",
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "crowdin_user_connection_required",
      message:
        "Connect your Crowdin account before loading glossary and translation memory matches.",
    } satisfies Partial<TmsProviderLiveError>);

    expect(searchCrowdinCatConcordanceMock).not.toHaveBeenCalled();
  });

  it.each(["crowdin_oauth_refresh_failed", "crowdin_oauth_token_invalid"] as const)(
    "throws a reconnect error when Crowdin OAuth token is invalid (%s)",
    async (errorCode) => {
      resolveExternalTmsSecretMaterialForActorMock.mockRejectedValue(new Error(errorCode));

      await expect(
        loadCatSegmentConcordance({
          organizationId: "org_1",
          projectId: "ext:crowdin:42",
          providerKind: "crowdin",
          actorUserId: "user_1",
          sourceLocale: "en",
          targetLocale: "fr",
          sourceText: "Hello",
        }),
      ).rejects.toMatchObject({
        code: "crowdin_user_auth_invalid",
        message: "Your Crowdin connection is invalid. Reconnect Crowdin and try again.",
      } satisfies Partial<TmsProviderLiveError>);

      expect(searchCrowdinCatConcordanceMock).not.toHaveBeenCalled();
    },
  );

  it("resolves per-user Lokalise credentials for live concordance", async () => {
    await loadCatSegmentConcordance({
      organizationId: "org_1",
      projectId: "ext:lokalise:proj.123",
      providerKind: "lokalise",
      actorUserId: "user_1",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
    });

    expect(resolveExternalTmsSecretMaterialForActorMock).toHaveBeenCalledWith({
      credential: lokaliseCredential,
      organizationId: "org_1",
      actorUserId: "user_1",
    });
    expect(lokaliseClientOptions).toEqual([
      {
        token: "user-token",
        baseUrl: "https://api.lokalise.com/api2",
      },
    ]);
    expect(searchLokaliseCatConcordanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProjectId: "proj.123",
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello",
      }),
    );
  });

  it("throws a user-facing error when Lokalise per-user auth is missing", async () => {
    resolveExternalTmsSecretMaterialForActorMock.mockRejectedValue(
      new Error("lokalise_user_connection_required"),
    );

    await expect(
      loadCatSegmentConcordance({
        organizationId: "org_1",
        projectId: "ext:lokalise:proj.123",
        providerKind: "lokalise",
        actorUserId: "user_1",
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "lokalise_user_connection_required",
      message:
        "Connect your Lokalise account before loading glossary and translation memory matches.",
    } satisfies Partial<TmsProviderLiveError>);

    expect(searchLokaliseCatConcordanceMock).not.toHaveBeenCalled();
  });

  it.each(["lokalise_oauth_refresh_failed", "lokalise_oauth_token_invalid"] as const)(
    "throws a reconnect error when Lokalise OAuth token is invalid (%s)",
    async (errorCode) => {
      resolveExternalTmsSecretMaterialForActorMock.mockRejectedValue(new Error(errorCode));

      await expect(
        loadCatSegmentConcordance({
          organizationId: "org_1",
          projectId: "ext:lokalise:proj.123",
          providerKind: "lokalise",
          actorUserId: "user_1",
          sourceLocale: "en",
          targetLocale: "fr",
          sourceText: "Hello",
        }),
      ).rejects.toMatchObject({
        code: "lokalise_user_auth_invalid",
        message: "Your Lokalise connection is invalid. Reconnect Lokalise and try again.",
      } satisfies Partial<TmsProviderLiveError>);

      expect(searchLokaliseCatConcordanceMock).not.toHaveBeenCalled();
    },
  );

  it("does not remap unknown Lokalise errors as auth failures", async () => {
    resolveExternalTmsSecretMaterialForActorMock.mockRejectedValue(
      new Error("lokalise_rate_limit_exceeded"),
    );

    await expect(
      loadCatSegmentConcordance({
        organizationId: "org_1",
        projectId: "ext:lokalise:proj.123",
        providerKind: "lokalise",
        actorUserId: "user_1",
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello",
      }),
    ).rejects.toThrow("lokalise_rate_limit_exceeded");

    expect(searchLokaliseCatConcordanceMock).not.toHaveBeenCalled();
  });

  it("maps provider concept matches into CAT glossaryConcepts", async () => {
    searchCrowdinCatConcordanceMock.mockResolvedValue({
      glossaryTerms: [
        {
          id: "live:crowdin:7:11:fr",
          glossaryId: "7",
          glossaryName: "Product terms",
          sourceTerm: "workspace",
          targetTerm: "espace de travail",
          sourceLocale: "en",
          targetLocale: "fr",
          description: "match description",
          caseSensitive: false,
          rank: 1,
          matchSource: "live_provider",
          providerKind: "crowdin",
          resourceId: "7",
          externalResourceId: "7",
          externalTermId: "11",
          termStatus: { forbidden: false, preferred: true },
          concept: {
            id: "c1",
            primaryTerm: "workspace",
            subject: "UI",
            definition: "Product workspace",
            glossaryUrl: "https://crowdin.com/glossary/7",
            sourceTerms: [
              {
                id: "11",
                locale: "en",
                text: "workspace",
                preferred: true,
                forbidden: false,
              },
            ],
            targetTerms: [
              {
                id: "12",
                locale: "fr",
                text: "espace de travail",
                preferred: true,
                forbidden: false,
              },
            ],
          },
        },
      ],
      translationMemoryMatches: [],
    });

    const result = await loadCatSegmentConcordance({
      organizationId: "org_1",
      organizationSlug: "test-glossary",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      actorUserId: "user_1",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "workspace",
    });

    expect(result.glossaryConcepts).toEqual([
      expect.objectContaining({
        id: "7:c1",
        glossaryId: "7",
        glossaryName: "Product terms",
        glossaryUrl: "/org/test-glossary/glossaries/crowdin:glossary:7",
        primaryTerm: "workspace",
        subject: "UI",
        definition: "Product workspace",
        sourceTerms: [expect.objectContaining({ id: "11", text: "workspace", preferred: true })],
        targetTerms: [
          expect.objectContaining({ id: "12", text: "espace de travail", preferred: true }),
        ],
      }),
    ]);
  });

  it("preserves admitted concept term status in CAT glossaryConcepts", async () => {
    searchCrowdinCatConcordanceMock.mockResolvedValue({
      glossaryTerms: [
        {
          id: "live:crowdin:7:11:fr",
          glossaryId: "7",
          glossaryName: "Product terms",
          sourceTerm: "workspace",
          targetTerm: "espace de travail",
          sourceLocale: "en",
          targetLocale: "fr",
          description: null,
          caseSensitive: false,
          rank: 1,
          matchSource: "live_provider",
          providerKind: "crowdin",
          resourceId: "7",
          externalResourceId: "7",
          externalTermId: "11",
          termStatus: { forbidden: false, preferred: false },
          concept: {
            id: "c1",
            primaryTerm: "workspace",
            sourceTerms: [
              {
                id: "11",
                locale: "en",
                text: "workspace",
                status: "preferred",
                preferred: true,
                forbidden: false,
              },
            ],
            targetTerms: [
              {
                id: "12",
                locale: "fr",
                text: "espace de travail",
                status: "admitted",
                preferred: true,
                forbidden: false,
              },
            ],
          },
        },
      ],
      translationMemoryMatches: [],
    });

    const result = await loadCatSegmentConcordance({
      organizationId: "org_1",
      organizationSlug: "test-glossary",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      actorUserId: "user_1",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "workspace",
    });

    expect(result.glossaryConcepts?.[0]?.targetTerms).toEqual([
      expect.objectContaining({
        id: "12",
        text: "espace de travail",
        status: "admitted",
        preferred: false,
        forbidden: false,
      }),
    ]);
  });

  it("synthesizes a concept when the provider match has no concept payload", async () => {
    searchCrowdinCatConcordanceMock.mockResolvedValue({
      glossaryTerms: [
        {
          id: "live:crowdin:7:workspace:fr",
          glossaryId: "7",
          glossaryName: "Product terms",
          sourceTerm: "workspace",
          targetTerm: "espace",
          sourceLocale: "en",
          targetLocale: "fr",
          description: "Workspace area",
          caseSensitive: false,
          rank: 1,
          matchSource: "live_provider",
          providerKind: "crowdin",
          resourceId: "7",
          externalResourceId: "7",
          externalTermId: "11",
          termStatus: { forbidden: true, preferred: false },
        },
      ],
      translationMemoryMatches: [],
    });

    const result = await loadCatSegmentConcordance({
      organizationId: "org_1",
      organizationSlug: "test-glossary",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      actorUserId: "user_1",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "workspace",
    });

    expect(result.glossaryConcepts).toEqual([
      expect.objectContaining({
        id: "7:en:workspace",
        glossaryUrl: "/org/test-glossary/glossaries/crowdin:glossary:7",
        primaryTerm: "workspace",
        definition: "Workspace area",
        sourceTerms: [
          expect.objectContaining({
            id: "live:crowdin:7:workspace:fr:source",
            text: "workspace",
            preferred: false,
            forbidden: true,
          }),
        ],
        targetTerms: [
          expect.objectContaining({
            id: "live:crowdin:7:workspace:fr:target",
            text: "espace",
            preferred: false,
            forbidden: true,
          }),
        ],
      }),
    ]);
  });

  it("merges unique terms when multiple matches share a concept id", async () => {
    searchCrowdinCatConcordanceMock.mockResolvedValue({
      glossaryTerms: [
        {
          id: "match-a",
          glossaryId: "7",
          glossaryName: "Product terms",
          sourceTerm: "workspace",
          targetTerm: "espace de travail",
          sourceLocale: "en",
          targetLocale: "fr",
          description: null,
          caseSensitive: false,
          rank: 1,
          matchSource: "live_provider",
          providerKind: "crowdin",
          resourceId: "7",
          externalResourceId: "7",
          externalTermId: "11",
          termStatus: { forbidden: false, preferred: true },
          concept: {
            id: "shared",
            primaryTerm: "workspace",
            definition: "Workspace",
            sourceTerms: [
              { id: "s1", locale: "en", text: "workspace", preferred: true, forbidden: false },
            ],
            targetTerms: [
              {
                id: "t1",
                locale: "fr",
                text: "espace de travail",
                preferred: true,
                forbidden: false,
              },
            ],
          },
        },
        {
          id: "match-b",
          glossaryId: "7",
          glossaryName: "Product terms",
          sourceTerm: "work space",
          targetTerm: "espace",
          sourceLocale: "en",
          targetLocale: "fr",
          description: null,
          caseSensitive: false,
          rank: 0.99,
          matchSource: "live_provider",
          providerKind: "crowdin",
          resourceId: "7",
          externalResourceId: "7",
          externalTermId: "13",
          termStatus: { forbidden: true, preferred: false },
          concept: {
            id: "shared",
            primaryTerm: "workspace",
            definition: "Workspace",
            sourceTerms: [
              { id: "s1", locale: "en", text: "workspace", preferred: true, forbidden: false },
              { id: "s2", locale: "en", text: "work space", preferred: false, forbidden: true },
            ],
            targetTerms: [
              { id: "t2", locale: "fr", text: "espace", preferred: false, forbidden: true },
            ],
          },
        },
      ],
      translationMemoryMatches: [],
    });

    const result = await loadCatSegmentConcordance({
      organizationId: "org_1",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      actorUserId: "user_1",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "workspace",
    });

    expect(result.glossaryConcepts).toHaveLength(1);
    expect(result.glossaryConcepts?.[0]).toMatchObject({
      id: "7:shared",
      sourceTerms: [
        expect.objectContaining({ id: "s1", text: "workspace" }),
        expect.objectContaining({ id: "s2", text: "work space" }),
      ],
      targetTerms: [
        expect.objectContaining({ id: "t1", text: "espace de travail" }),
        expect.objectContaining({ id: "t2", text: "espace" }),
      ],
    });
  });
});
