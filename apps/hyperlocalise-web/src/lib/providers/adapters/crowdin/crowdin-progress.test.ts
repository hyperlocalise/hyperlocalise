import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

const { crowdinFetchMock } = vi.hoisted(() => ({
  crowdinFetchMock: vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const listResponse = (items: unknown[]) =>
      new Response(JSON.stringify({ data: items.map((data) => ({ data })) }), { status: 200 });
    const getResponse = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    const sourceString = (input: {
      id: number;
      identifier: string;
      text: string | Record<string, string>;
      fileId?: number | null;
    }) => ({
      id: input.id,
      projectId: 42,
      fileId: input.fileId ?? 7,
      branchId: null,
      directoryId: null,
      identifier: input.identifier,
      text: input.text,
      type: "text",
      context: null,
      labelIds: null,
    });
    const countStrings = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        sourceString({
          id: 10_000 + index,
          identifier: `count.${index}`,
          text: `Count ${index}`,
        }),
      );
    const progress = (input: {
      languageId: string;
      translationProgress: number;
      approvalProgress: number;
      words?: { total: number; translated: number; approved: number };
      phrases?: { total: number; translated: number; approved: number };
    }) => ({
      languageId: input.languageId,
      words: input.words ?? { total: 100, translated: 80, approved: 60 },
      phrases: input.phrases ?? { total: 50, translated: 40, approved: 30 },
      translationProgress: input.translationProgress,
      approvalProgress: input.approvalProgress,
    });

    const parsed = new URL(String(url));
    const path = parsed.pathname;

    if (path.endsWith("/projects/42/languages/progress")) {
      return listResponse([
        progress({
          languageId: "fr",
          translationProgress: 80,
          approvalProgress: 60,
        }),
      ]);
    }

    if (path.endsWith("/projects/42/files/7/languages/progress")) {
      return listResponse([
        progress({
          languageId: "fr",
          translationProgress: 40,
          approvalProgress: 20,
          words: { total: 20, translated: 8, approved: 4 },
          phrases: { total: 10, translated: 4, approved: 2 },
        }),
      ]);
    }

    if (path.endsWith("/projects/42/files")) {
      return listResponse([
        {
          id: 7,
          branchId: null,
          directoryId: null,
          name: "messages.json",
          title: null,
          type: "json",
          path: "/src/messages.json",
          status: "active",
          revisionId: 1,
        },
        {
          id: 8,
          branchId: null,
          directoryId: null,
          name: "messages.json",
          title: null,
          type: "json",
          path: "/app/locales/messages.json",
          status: "active",
          revisionId: 1,
        },
        {
          id: 9,
          branchId: null,
          directoryId: null,
          name: "admin.json",
          title: null,
          type: "json",
          path: "/admin/locales/admin.json",
          status: "active",
          revisionId: 1,
        },
      ]);
    }

    if (path.endsWith("/projects/42/strings/9001")) {
      return getResponse(
        sourceString({
          id: 9001,
          identifier: 'say "hi" \\ back',
          text: { one: "Say hi" },
        }),
      );
    }

    if (path.endsWith("/projects/42/strings/9004")) {
      return new Response(JSON.stringify({ message: "String not found" }), { status: 404 });
    }

    if (path.endsWith("/projects/42/strings")) {
      const fileId = parsed.searchParams.get("fileId");
      const croql = parsed.searchParams.get("croql") ?? "";

      if (fileId === "7") {
        return listResponse(countStrings(5));
      }
      if (croql.includes("not is approved")) {
        return listResponse(countStrings(3));
      }
      if (croql.includes("is approved")) {
        return listResponse(countStrings(2));
      }
      if (croql.includes("is translated")) {
        return listResponse(countStrings(4));
      }
      if (croql.includes("has unresolved issue")) {
        return listResponse(countStrings(1));
      }
      if (croql === 'identifier = "say \\"hi\\" \\\\ back"') {
        return listResponse([
          sourceString({
            id: 9001,
            identifier: 'say "hi" \\ back',
            text: { one: "Say hi" },
          }),
        ]);
      }
      if (croql === 'identifier = "shared.title"') {
        return listResponse([
          sourceString({ id: 9002, identifier: "shared.title", text: "Shared title" }),
          sourceString({ id: 9003, identifier: "shared.title", text: "Other shared title" }),
        ]);
      }

      return listResponse([]);
    }

    if (path.endsWith("/projects/42/translations")) {
      const stringId = parsed.searchParams.get("stringId");
      const languageId = parsed.searchParams.get("languageId");

      if (stringId === "9001" && languageId === "fr") {
        return listResponse([
          { id: 101, text: "Bonjour ancien", createdAt: "2026-01-01T00:00:00Z" },
          { id: 102, text: "Bonjour", createdAt: "2026-01-02T00:00:00Z" },
        ]);
      }
      if (stringId === "9001" && languageId === "de") {
        return listResponse([{ id: 201, text: "Hallo", createdAt: "2026-01-02T00:00:00Z" }]);
      }

      return listResponse([]);
    }

    if (path.endsWith("/projects/42/approvals")) {
      const stringId = parsed.searchParams.get("stringId");
      const languageId = parsed.searchParams.get("languageId");

      if (stringId === "9001" && languageId === "fr") {
        return listResponse([{ id: 501, translationId: 102, stringId: 9001, languageId: "fr" }]);
      }

      return listResponse([]);
    }

    if (path.endsWith("/projects/42")) {
      return getResponse({
        id: 42,
        name: "Demo App",
        identifier: "demo-app",
        sourceLanguageId: "en",
        targetLanguageIds: ["en", "fr", "de"],
        webUrl: "https://example.crowdin.com/u/projects/42",
        isSuspended: false,
      });
    }

    return listResponse([]);
  }),
}));

vi.stubGlobal("fetch", crowdinFetchMock);

describe("checkCrowdinProgress", () => {
  beforeEach(async () => {
    const { loadCrowdinProjectCredential } = await import("./load-crowdin-project-credential");
    const { resolveExternalTmsSecretMaterialForActor } =
      await import("@/lib/providers/tms-provider-content");

    vi.clearAllMocks();
    vi.mocked(loadCrowdinProjectCredential).mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    } as NonNullable<Awaited<ReturnType<typeof loadCrowdinProjectCredential>>>);
    vi.mocked(resolveExternalTmsSecretMaterialForActor).mockResolvedValue("token");
  });

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

    crowdinFetchMock.mockClear();
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
      crowdinFetchMock.mock.calls.some((call) => {
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

  it("returns file progress for a normalized Crowdin file path with queue counts", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      actorUserId: "user_1",
      scope: "file",
      filePath: " /SRC/MESSAGES.JSON ",
      languageIds: ["fr"],
      targetLocale: "fr",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        scope: "file",
        resource: {
          type: "file",
          id: 7,
          path: "/src/messages.json",
        },
        languages: [
          {
            languageId: "fr",
            translationProgress: 40,
            approvalProgress: 20,
            words: { total: 20, translated: 8, approved: 4 },
          },
        ],
      });
    }
  });

  it("requires a precise file locator when a path matches multiple Crowdin files", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "file",
      filePath: "locales",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "crowdin_resource_not_found",
      });
      expect(result.error.message).toContain("Multiple Crowdin files matched");
      expect(result.error.message).toContain("/app/locales/messages.json");
      expect(result.error.message).toContain("/admin/locales/admin.json");
    }
  });

  it("returns a not found error when no Crowdin file matches the path", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "file",
      filePath: "nonexistent.json",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "crowdin_resource_not_found",
        message: 'No Crowdin file matched "nonexistent.json".',
      });
    }
  });

  it("returns an invalid input error when file scope has no locator", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "file",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "crowdin_invalid_input",
        message: "Provide fileId or filePath when checking file progress.",
      });
    }
  });

  it("returns string translation and approval status for an escaped Crowdin identifier", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "string",
      stringIdentifier: 'say "hi" \\ back',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        scope: "string",
        resource: {
          type: "string",
          id: 9001,
          identifier: 'say "hi" \\ back',
          text: "Say hi",
        },
        languages: [
          {
            languageId: "fr",
            translationProgress: 100,
            approvalProgress: 100,
            words: { total: 1, translated: 1, approved: 1 },
          },
          {
            languageId: "de",
            translationProgress: 100,
            approvalProgress: 0,
            words: { total: 1, translated: 1, approved: 0 },
          },
        ],
        stringTranslations: [
          {
            languageId: "fr",
            translated: true,
            approved: true,
            text: "Bonjour",
          },
          {
            languageId: "de",
            translated: true,
            approved: false,
            text: "Hallo",
          },
        ],
      });
    }

    expect(
      crowdinFetchMock.mock.calls.some((call) => {
        const requestUrl = call[0];
        if (typeof requestUrl !== "string") {
          return false;
        }
        const parsed = new URL(requestUrl);
        return parsed.searchParams.get("croql") === 'identifier = "say \\"hi\\" \\\\ back"';
      }),
    ).toBe(true);
  });

  it("fetches numeric string locators with the Get String endpoint", async () => {
    crowdinFetchMock.mockClear();

    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "string",
      stringId: 9001,
      languageIds: ["fr"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        scope: "string",
        resource: {
          type: "string",
          id: 9001,
          identifier: 'say "hi" \\ back',
          text: "Say hi",
        },
        languages: [
          {
            languageId: "fr",
            translationProgress: 100,
            approvalProgress: 100,
          },
        ],
      });
    }

    expect(
      crowdinFetchMock.mock.calls.some((call) => {
        const requestUrl = call[0];
        if (typeof requestUrl !== "string") {
          return false;
        }
        return new URL(requestUrl).pathname.endsWith("/projects/42/strings/9001");
      }),
    ).toBe(true);
    expect(
      crowdinFetchMock.mock.calls.some((call) => {
        const requestUrl = call[0];
        if (typeof requestUrl !== "string") {
          return false;
        }
        const parsed = new URL(requestUrl);
        return (
          parsed.pathname.endsWith("/projects/42/strings") && parsed.searchParams.has("croql")
        );
      }),
    ).toBe(false);
  });

  it("returns not found when a numeric Crowdin string is missing", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "string",
      stringId: 9004,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "crowdin_resource_not_found",
        message: "Crowdin string 9004 was not found in this project.",
      });
    }
  });

  it("returns an ambiguity error when an exact string identifier matches multiple strings", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "string",
      stringIdentifier: "shared.title",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "crowdin_resource_not_found",
      });
      expect(result.error.message).toContain("Multiple Crowdin strings matched identifier");
      expect(result.error.message).toContain("9002, 9003");
    }
  });

  it("returns an invalid input error when string scope has no locator", async () => {
    const result = await checkCrowdinProgress({
      organizationId: "org_1",
      projectId: "proj_1",
      scope: "string",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "crowdin_invalid_input",
        message: "Provide stringId or stringIdentifier when checking string progress.",
      });
    }
  });
});
