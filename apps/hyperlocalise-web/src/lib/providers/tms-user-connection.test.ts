import { describe, expect, it, vi } from "vite-plus/test";

import { ApiResponseError } from "@/lib/api-error";

import {
  formatTmsUserConnectProviderLabel,
  getTmsUserConnectCtaState,
  isTmsUserConnectionRequiredError,
  tmsUserConnectionRequiredMessage,
} from "./tms-user-connection";

vi.mock("@/lib/providers/organization-external-tms-provider-credentials", () => ({
  CROWDIN_OAUTH_AUTH_MODE: "oauth",
  getActiveOrganizationExternalTmsProviderCredentialRow: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-user-connections", () => ({
  getCrowdinUserConnection: vi.fn(),
}));

import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getCrowdinUserConnection } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";

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

    expect(getCrowdinUserConnection).not.toHaveBeenCalled();
  });

  it("returns connect CTA for Crowdin OAuth without a user link", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "crowdin",
      authMode: "oauth",
      displayName: "My Crowdin",
    } as never);
    vi.mocked(getCrowdinUserConnection).mockResolvedValue(null);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({
      showConnectCta: true,
      providerKind: "crowdin",
      providerDisplayName: "My Crowdin",
    });
  });

  it("returns no CTA when Crowdin user is already linked", async () => {
    vi.mocked(getActiveOrganizationExternalTmsProviderCredentialRow).mockResolvedValue({
      providerKind: "crowdin",
      authMode: "oauth",
      displayName: "Crowdin",
    } as never);
    vi.mocked(getCrowdinUserConnection).mockResolvedValue({ id: "conn-1" } as never);

    await expect(
      getTmsUserConnectCtaState({ organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({ showConnectCta: false });
  });
});

describe("tms user connection helpers", () => {
  it("formats provider labels and messages", () => {
    expect(formatTmsUserConnectProviderLabel("crowdin")).toBe("Crowdin");
    expect(tmsUserConnectionRequiredMessage("crowdin", "jobs")).toBe(
      "Connect Crowdin to view provider jobs.",
    );
  });

  it("detects user connection required API errors", () => {
    const error = new ApiResponseError("Connect Crowdin", {
      code: "crowdin_user_connection_required",
      status: 401,
    });
    expect(isTmsUserConnectionRequiredError(error)).toBe(true);
    expect(isTmsUserConnectionRequiredError(new Error("other"))).toBe(false);
  });
});
