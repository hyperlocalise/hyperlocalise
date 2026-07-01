import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock(
  "@/lib/providers/organization-external-tms-provider-credentials",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/providers/organization-external-tms-provider-credentials")
      >();
    return {
      ...actual,
      getActiveOrganizationExternalTmsProviderCredentialRow: vi.fn(),
      resolveExternalTmsSecretMaterial: vi.fn(),
    };
  },
);

vi.mock("@/lib/providers/adapters/crowdin/crowdin-user-connections", () => ({
  getCrowdinUserConnection: vi.fn(),
  resolveCrowdinUserConnectionSecretMaterial: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/phrase/phrase-user-connections", () => ({
  getPhraseUserConnection: vi.fn(),
  resolvePhraseUserConnectionSecretMaterial: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", () => ({
  CrowdinApiClient: vi.fn(function CrowdinApiClientMock() {
    return {
      getProject: vi.fn(),
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
import {
  getActiveOrganizationExternalTmsProviderCredentialRow,
  resolveExternalTmsSecretMaterial,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  getPhraseUserConnection,
  resolvePhraseUserConnectionSecretMaterial,
} from "@/lib/providers/adapters/phrase/phrase-user-connections";

import * as tmsProviderLive from "./tms-provider-live";

const { getTmsProviderLiveProject, TmsProviderLiveError, tryLoadActiveTmsProviderContext } =
  tmsProviderLive;

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
      vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue(
        phraseOAuthCredential as never,
      );
      vi.mocked(getPhraseUserConnection).mockResolvedValue({ id: "connection-1" } as never);
      vi.mocked(resolvePhraseUserConnectionSecretMaterial).mockRejectedValue(new Error(errorCode));

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
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns the project with openJobCount 0 when job enrichment fails", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue(
      crowdinCredential as never,
    );
    vi.mocked(resolveExternalTmsSecretMaterial).mockResolvedValue("crowdin-token");

    const getProject = vi.fn().mockResolvedValue({
      id: 42,
      name: "Crowdin Project",
      sourceLanguageId: "en",
      targetLanguageIds: ["fr"],
      webUrl: "https://crowdin.com/project/test",
      isSuspended: false,
    });
    vi.mocked(CrowdinApiClient).mockImplementation(function () {
      return { getProject } as never;
    });

    vi.spyOn(tmsProviderLive, "listTmsProviderLiveJobsForProject").mockRejectedValue(
      new TmsProviderLiveError("crowdin_rate_limited", "Rate limited"),
    );

    const project = await getTmsProviderLiveProject("org-1", "42");

    expect(project).toMatchObject({
      name: "Crowdin Project",
      externalProjectId: "42",
      openJobCount: 0,
    });
    expect(getProject).toHaveBeenCalledWith(42);
  });
});
