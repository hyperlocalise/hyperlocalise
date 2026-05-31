import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchSmartlingFileKeys } from "./smartling-file-fetcher";

describe("fetchSmartlingFileKeys", () => {
  let originalFetch: typeof fetch;

  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "smartling" as const,
    displayName: "Smartling",
    region: null,
    baseUrl: null,
    validationStatus: "connected",
    validationMessage: null,
    lastValidatedAt: null,
    encryptionAlgorithm: "aes-256-gcm",
    keyVersion: 1,
    ciphertext: "cipher",
    iv: "iv",
    authTag: "tag",
    maskedSecretSuffix: "cret",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized file and key metadata from Smartling", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/source-strings")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    hashcode: "abc123",
                    stringText: "Hello",
                    fileUri: "locales/en.json",
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects-api/v2/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId: "proj-1",
                projectName: "Marketing",
                sourceLocaleId: "en-US",
                archived: false,
                targetLocales: [{ localeId: "de-DE", enabled: true }],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/files/list")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    fileUri: "locales/en.json",
                    fileType: "json",
                    lastUploaded: "2026-05-01T00:00:00Z",
                    hasInstructions: true,
                    directives: { placeholder_format: "icu" },
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/file/status")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    localeId: "de-DE",
                    completedStringCount: 10,
                    authorizedStringCount: 8,
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchSmartlingFileKeys({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      credential,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
    });

    expect(result).toHaveLength(2);

    const file = result.find((item) => item.resourceType === "file");
    expect(file).toMatchObject({
      externalResourceId: "locales/en.json",
      sourcePath: "locales/en.json",
      format: "json",
      sourceLocale: "en-US",
      targetLocales: ["de-DE"],
      revision: "2026-05-01T00:00:00Z",
    });
    expect(file?.localeReadiness).toMatchObject({
      "de-DE": {
        completedStringCount: 10,
        authorizedStringCount: 8,
      },
    });
    expect(file?.providerPayload).toMatchObject({
      fileUri: "locales/en.json",
      directives: { placeholder_format: "icu" },
    });

    const key = result.find((item) => item.resourceType === "key");
    expect(key).toMatchObject({
      externalResourceId: "locales/en.json::abc123",
      sourcePath: "locales/en.json/keys/abc123",
      displayName: "Hello",
    });
  });

  it("uses fileUri as stable file identity across repeated syncs", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects-api/v2/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId: "proj-1",
                projectName: "Marketing",
                sourceLocaleId: "en-US",
                archived: false,
                targetLocales: [],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/files/list")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ fileUri: "app/messages.json", fileType: "json" }],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/file/status")) {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: { items: [] } },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/source-strings")) {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: { items: [], totalCount: 0 } },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const input = {
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "smartling" as const,
      externalProjectId: "proj-1",
      credential,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
    };

    const first = await fetchSmartlingFileKeys(input);
    const second = await fetchSmartlingFileKeys(input);

    expect(first[0]?.externalResourceId).toBe("app/messages.json");
    expect(second[0]?.externalResourceId).toBe("app/messages.json");
    expect(first[0]?.externalResourceId).toBe(second[0]?.externalResourceId);
  });

  it("uses file-scoped externalResourceId for keys to avoid hash collisions across files", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects-api/v2/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId: "proj-1",
                projectName: "Marketing",
                sourceLocaleId: "en-US",
                archived: false,
                targetLocales: [],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/files/list")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  { fileUri: "locales/en.json", fileType: "json" },
                  { fileUri: "locales/de.json", fileType: "json" },
                ],
                totalCount: 2,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/file/status")) {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: { items: [] } },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/source-strings")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ hashcode: "shared-hash", stringText: "OK" }],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchSmartlingFileKeys({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      credential,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
    });

    const keys = result.filter((item) => item.resourceType === "key");
    expect(keys).toHaveLength(2);
    expect(keys.map((key) => key.externalResourceId).toSorted()).toEqual([
      "locales/de.json::shared-hash",
      "locales/en.json::shared-hash",
    ]);
  });

  it("throws on invalid project id", async () => {
    await expect(
      fetchSmartlingFileKeys({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "smartling",
        externalProjectId: "  ",
        credential,
        project: {} as never,
        secretMaterial: "user:secret:acct-1",
      }),
    ).rejects.toThrow("invalid_smartling_project_id");
  });

  it("throws smartling_auth_invalid on 401", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          response: { code: "AUTHENTICATION_ERROR", errors: [{ message: "Unauthorized" }] },
        }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    await expect(
      fetchSmartlingFileKeys({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "smartling",
        externalProjectId: "proj-1",
        credential,
        project: {} as never,
        secretMaterial: "user:secret:acct-1",
      }),
    ).rejects.toThrow("smartling_auth_invalid");
  });
});
