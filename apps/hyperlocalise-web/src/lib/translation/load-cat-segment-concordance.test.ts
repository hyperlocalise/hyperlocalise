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
import { loadCatSegmentConcordance } from "./load-cat-segment-concordance";

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
});
