import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  getActiveOrganizationExternalTmsProviderCredentialRowMock,
  resolveExternalTmsSecretMaterialMock,
  getPhraseUserConnectionMock,
  resolvePhraseUserConnectionSecretMaterialMock,
} = vi.hoisted(() => ({
  getActiveOrganizationExternalTmsProviderCredentialRowMock: vi.fn(),
  resolveExternalTmsSecretMaterialMock: vi.fn(),
  getPhraseUserConnectionMock: vi.fn(),
  resolvePhraseUserConnectionSecretMaterialMock: vi.fn(),
}));

vi.mock(
  "@/lib/providers/credentials/organization-external-tms-provider-credentials",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/providers/credentials/organization-external-tms-provider-credentials")
      >();
    return {
      ...actual,
      getActiveOrganizationExternalTmsProviderCredentialRow: (...args: unknown[]) =>
        getActiveOrganizationExternalTmsProviderCredentialRowMock(...args),
      resolveExternalTmsSecretMaterial: (...args: unknown[]) =>
        resolveExternalTmsSecretMaterialMock(...args),
    };
  },
);

vi.mock("@/lib/providers/adapters/crowdin/crowdin-auth", () => ({
  crowdinAuth: {
    getUserConnection: vi.fn(),
    resolveUserConnectionSecretMaterial: vi.fn(),
  },
}));

vi.mock("@/lib/providers/adapters/phrase/phrase-auth", () => ({
  getPhraseUserConnection: (...args: unknown[]) => getPhraseUserConnectionMock(...args),
  resolvePhraseUserConnectionSecretMaterial: (...args: unknown[]) =>
    resolvePhraseUserConnectionSecretMaterialMock(...args),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", () => ({
  CrowdinApiClient: vi.fn(function CrowdinApiClientMock() {
    return {
      getProject: vi.fn(),
      listBranches: vi.fn(),
    };
  }),
  CrowdinApiError: class CrowdinApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "CrowdinApiError";
      this.status = status;
    }
  },
}));

import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live-error";
import { getTmsProviderLiveProject, tryLoadActiveTmsProviderContext } from "./tms-provider-live";

const phraseOAuthCredential = {
  id: "credential-1",
  providerKind: "phrase",
  authMode: "oauth",
  displayName: "Phrase",
  region: null,
  baseUrl: "https://cloud.memsource.com",
  oauthExpiresAt: null,
  validationStatus: "valid",
  validationMessage: null,
  lastValidatedAt: null,
};

const crowdinCredential = {
  id: "credential-crowdin",
  providerKind: "crowdin",
  authMode: "api_token",
  displayName: "Crowdin",
  region: null,
  baseUrl: null,
  oauthExpiresAt: null,
  validationStatus: "valid",
  validationMessage: null,
  lastValidatedAt: null,
  maskedSecretSuffix: "oken",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("tryLoadActiveTmsProviderContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["phrase_oauth_token_response_invalid", "phrase_user_connection_not_found"] as const)(
    "normalizes %s to a Phrase auth error",
    async (errorCode) => {
      getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(
        phraseOAuthCredential,
      );
      getPhraseUserConnectionMock.mockResolvedValue({ id: "connection-1" });
      resolvePhraseUserConnectionSecretMaterialMock.mockRejectedValue(new Error(errorCode));

      const promise = tryLoadActiveTmsProviderContext("org-1", { actorUserId: "user-1" });

      await expect(promise).rejects.toBeInstanceOf(TmsProviderLiveError);
      await expect(promise).rejects.toMatchObject({
        code: "phrase_user_auth_invalid",
        message: "Your Phrase connection is invalid. Reconnect Phrase and try again.",
      });
    },
  );
});

describe("getTmsProviderLiveProject", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the live Crowdin project with branch metadata", async () => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(crowdinCredential);
    resolveExternalTmsSecretMaterialMock.mockResolvedValue("crowdin-token");

    const getProject = vi.fn().mockResolvedValue({
      id: 42,
      name: "Crowdin Project",
      identifier: "crowdin-project",
      sourceLanguageId: "en",
      targetLanguageIds: ["fr"],
      webUrl: "https://crowdin.com/project/test",
      isSuspended: false,
    });
    const listBranches = vi
      .fn()
      .mockResolvedValue([{ id: 10, name: "main", title: "Main Branch" }]);
    vi.mocked(CrowdinApiClient).mockImplementation(function () {
      return { getProject, listBranches } as never;
    });

    const project = await getTmsProviderLiveProject("org-1", "42");

    expect(project).toMatchObject({
      name: "Crowdin Project",
      externalProjectId: "42",
      metadata: {
        identifier: "crowdin-project",
        branches: [{ id: 10, name: "main", title: "Main Branch" }],
      },
    });
    expect(getProject).toHaveBeenCalledWith(42);
    expect(listBranches).toHaveBeenCalledWith(42);
  });
});
