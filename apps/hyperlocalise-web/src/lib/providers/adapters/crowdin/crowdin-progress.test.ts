import { describe, expect, it, vi } from "vite-plus/test";

import { checkCrowdinProgress } from "./crowdin-progress";

const baseCredential = {
  encryptionAlgorithm: "aes-256-gcm",
  keyVersion: 1,
  ciphertext: "cipher",
  iv: "iv",
  authTag: "tag",
  baseUrl: null,
  providerKind: "crowdin" as const,
  authMode: "api_token",
};

vi.mock("./load-crowdin-project-credential", () => ({
  loadCrowdinProjectCredential: vi.fn(async () => ({
    externalProjectId: "42",
    credential: baseCredential,
  })),
}));

vi.mock("@/lib/providers/tms-provider-content", () => ({
  resolveExternalTmsSecretMaterialForActor: vi.fn(async () => "token"),
}));

vi.mock("@/lib/providers/provider-safe-fetch", () => ({
  providerSafeFetch: vi.fn(async (url: string) => {
    if (String(url).includes("/projects/42/languages/progress")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              data: {
                languageId: "fr",
                words: { total: 100, translated: 80, approved: 60 },
                phrases: { total: 50, translated: 40, approved: 30 },
                translationProgress: 80,
                approvalProgress: 60,
              },
            },
          ],
        }),
        { status: 200 },
      );
    }

    if (String(url).includes("/projects/42")) {
      return new Response(
        JSON.stringify({
          data: {
            id: 42,
            name: "Demo App",
            identifier: "demo-app",
            sourceLanguageId: "en",
            targetLanguageIds: ["en", "fr", "de"],
            webUrl: "https://example.crowdin.com/u/projects/42",
            isSuspended: false,
          },
        }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }),
}));

describe("checkCrowdinProgress", () => {
  it("returns project-level language progress", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "project",
      languageIds: ["fr"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        scope: "project",
        crowdinProjectId: 42,
        crowdinProjectName: "Demo App",
        languages: [
          {
            languageId: "fr",
            translationProgress: 80,
            approvalProgress: 60,
          },
        ],
      });
    }
  });

  it("resolves Crowdin credentials for the acting user", async () => {
    const { resolveExternalTmsSecretMaterialForActor } =
      await import("@/lib/providers/tms-provider-content");

    vi.mocked(resolveExternalTmsSecretMaterialForActor).mockClear();

    await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      actorUserId: "user_1",
      scope: "project",
    });

    expect(resolveExternalTmsSecretMaterialForActor).toHaveBeenCalledWith({
      credential: baseCredential,
      organizationId: "org_1",
      actorUserId: "user_1",
    });
  });

  it("uses the credential enterprise base URL for API requests", async () => {
    const { loadCrowdinProjectCredential } = await import("./load-crowdin-project-credential");
    const { providerSafeFetch } = await import("@/lib/providers/provider-safe-fetch");

    vi.mocked(providerSafeFetch).mockClear();
    vi.mocked(loadCrowdinProjectCredential).mockResolvedValueOnce({
      externalProjectId: "42",
      credential: {
        ...baseCredential,
        baseUrl: "https://acme.api.crowdin.com/api/v2",
      },
    } as NonNullable<Awaited<ReturnType<typeof loadCrowdinProjectCredential>>>);

    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "project",
    });

    expect(result.ok).toBe(true);
    expect(
      vi.mocked(providerSafeFetch).mock.calls.some((call) => {
        const url = call[0];
        return (
          typeof url === "string" &&
          url.startsWith("https://acme.api.crowdin.com/api/v2/projects/42")
        );
      }),
    ).toBe(true);
  });

  it("returns an error when Crowdin is not configured", async () => {
    const { loadCrowdinProjectCredential } = await import("./load-crowdin-project-credential");
    vi.mocked(loadCrowdinProjectCredential).mockResolvedValueOnce(null);

    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "project",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("crowdin_not_configured");
    }
  });

  it("returns an error when the acting user has not connected Crowdin", async () => {
    const { resolveExternalTmsSecretMaterialForActor } =
      await import("@/lib/providers/tms-provider-content");

    vi.mocked(resolveExternalTmsSecretMaterialForActor).mockRejectedValueOnce(
      new Error("crowdin_user_connection_required"),
    );

    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      actorUserId: "user_1",
      scope: "project",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "crowdin_api_error",
        message: "Connect your Crowdin account before checking Crowdin progress.",
      });
    }
  });
});
