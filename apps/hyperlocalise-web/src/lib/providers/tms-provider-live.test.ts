import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/providers/organization-external-tms-provider-credentials", () => ({
  API_TOKEN_AUTH_MODE: "api_token",
  OAUTH_AUTH_MODE: "oauth",
  getActiveOrganizationExternalTmsProviderCredentialRow: vi.fn(),
  resolveExternalTmsSecretMaterial: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-user-connections", () => ({
  getCrowdinUserConnection: vi.fn(),
  resolveCrowdinUserConnectionSecretMaterial: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/phrase/phrase-user-connections", () => ({
  getPhraseUserConnection: vi.fn(),
  resolvePhraseUserConnectionSecretMaterial: vi.fn(),
}));

import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  getPhraseUserConnection,
  resolvePhraseUserConnectionSecretMaterial,
} from "@/lib/providers/adapters/phrase/phrase-user-connections";

import { TmsProviderLiveError, tryLoadActiveTmsProviderContext } from "./tms-provider-live";

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
