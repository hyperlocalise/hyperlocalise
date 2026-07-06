import { describe, expect, it, vi } from "vite-plus/test";

import { ApiResponseError } from "@/lib/api-error";

import {
  formatTmsUserConnectProviderLabel,
  getTmsUserConnectCtaState,
  isTmsUserConnectionRequiredError,
  tmsUserConnectionRequiredMessage,
} from "./tms-user-connection";

vi.mock("@/lib/providers/credentials/organization-external-tms-provider-credentials", () => ({
  OAUTH_AUTH_MODE: "oauth",
  PAT_AUTH_MODE: "pat",
  crowdinUsesPerUserAuth: (authMode: string) => authMode === "oauth" || authMode === "pat",
  getActiveOrganizationExternalTmsProviderCredentialRow: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-auth", () => ({
  crowdinAuth: {
    getUserConnection: vi.fn(),
  },
}));

vi.mock("@/lib/providers/adapters/phrase/phrase-auth", () => ({
  getPhraseUserConnection: vi.fn(),
}));

import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import { getPhraseUserConnection } from "@/lib/providers/adapters/phrase/phrase-auth";

describe("getTmsUserConnectCtaState", () => {
  it("returns no CTA when there is no active integration", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue(null);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({ showConnectCta: false });
  });

  it("returns no CTA when active integration is not Crowdin OAuth", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "phrase",
      authMode: "api_token",
      displayName: "Phrase",
    } as never);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({ showConnectCta: false });

    expect(crowdinAuth.getUserConnection).not.toHaveBeenCalled();
    expect(getPhraseUserConnection).not.toHaveBeenCalled();
  });

  it("returns connect CTA for Crowdin OAuth without a user link", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "crowdin",
      authMode: "oauth",
      displayName: "My Crowdin",
    } as never);
    vi.mocked(crowdinAuth.getUserConnection).mockResolvedValue(null);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({
      showConnectCta: true,
      providerKind: "crowdin",
      providerDisplayName: "My Crowdin",
      connectMethod: "oauth",
    });
  });

  it("returns connect CTA for Crowdin PAT without a user link", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "crowdin",
      authMode: "pat",
      displayName: "My Crowdin",
    } as never);
    vi.mocked(crowdinAuth.getUserConnection).mockResolvedValue(null);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({
      showConnectCta: true,
      providerKind: "crowdin",
      providerDisplayName: "My Crowdin",
      connectMethod: "pat",
    });
  });

  it("returns no CTA when Crowdin user is already linked", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "crowdin",
      authMode: "oauth",
      displayName: "Crowdin",
    } as never);
    vi.mocked(crowdinAuth.getUserConnection).mockResolvedValue({ id: "conn-1" } as never);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({ showConnectCta: false });
  });

  it("returns connect CTA for Phrase OAuth without a user link", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "phrase",
      authMode: "oauth",
      displayName: "My Phrase",
    } as never);
    vi.mocked(getPhraseUserConnection).mockResolvedValue(null);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({
      showConnectCta: true,
      providerKind: "phrase",
      providerDisplayName: "My Phrase",
      connectMethod: "oauth",
    });
  });

  it("returns no CTA when Phrase user is already linked", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "phrase",
      authMode: "oauth",
      displayName: "Phrase",
    } as never);
    vi.mocked(getPhraseUserConnection).mockResolvedValue({ id: "conn-1" } as never);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({ showConnectCta: false });
  });
});

describe("tms user connection helpers", () => {
  it("formats provider labels and messages", () => {
    expect(formatTmsUserConnectProviderLabel("crowdin")).toBe("Crowdin");
    expect(formatTmsUserConnectProviderLabel("phrase")).toBe("Phrase");
    expect(tmsUserConnectionRequiredMessage("crowdin", "jobs")).toBe(
      "Connect Crowdin to view provider jobs.",
    );
    expect(tmsUserConnectionRequiredMessage("phrase", "files")).toBe(
      "Connect Phrase to view provider files.",
    );
  });

  it("detects user connection required API errors", () => {
    const error = new ApiResponseError("Connect Crowdin", {
      code: "crowdin_user_connection_required",
      status: 401,
    });
    expect(isTmsUserConnectionRequiredError(error)).toBe(true);
    const phraseError = new ApiResponseError("Connect Phrase", {
      code: "phrase_user_connection_required",
      status: 401,
    });
    expect(isTmsUserConnectionRequiredError(phraseError)).toBe(true);
    expect(isTmsUserConnectionRequiredError(new Error("other"))).toBe(false);
  });
});
