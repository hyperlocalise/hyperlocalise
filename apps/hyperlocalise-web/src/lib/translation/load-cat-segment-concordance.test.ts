import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  crowdinClientOptions,
  loadCrowdinProjectCredentialMock,
  resolveExternalTmsSecretMaterialForActorMock,
  searchCrowdinCatConcordanceMock,
} = vi.hoisted(() => ({
  crowdinClientOptions: [] as unknown[],
  loadCrowdinProjectCredentialMock: vi.fn(),
  resolveExternalTmsSecretMaterialForActorMock: vi.fn(),
  searchCrowdinCatConcordanceMock: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/load-crowdin-project-credential", () => ({
  loadCrowdinProjectCredential: (...args: unknown[]) => loadCrowdinProjectCredentialMock(...args),
}));

vi.mock("@/lib/providers/tms-provider-content", () => ({
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

vi.mock("@/lib/providers/adapters/crowdin/crowdin-cat-concordance", () => ({
  searchCrowdinCatConcordance: (...args: unknown[]) => searchCrowdinCatConcordanceMock(...args),
}));

import { TmsProviderLiveError } from "@/lib/providers/tms-provider-live";
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

describe("loadCatSegmentConcordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crowdinClientOptions.length = 0;
    loadCrowdinProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    resolveExternalTmsSecretMaterialForActorMock.mockResolvedValue("user-token");
    searchCrowdinCatConcordanceMock.mockResolvedValue({
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
});
