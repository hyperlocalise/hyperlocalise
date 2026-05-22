import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pushCrowdinTranslations } from "./crowdin-translation-pusher";

describe("pushCrowdinTranslations", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uploads approved translations through storage/import and records async build metadata", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/projects/42/tasks/2001")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 2001,
              projectId: 42,
              type: 0,
              status: "in_progress",
              title: "French task",
              description: null,
              targetLanguageId: "fr",
              languageId: "fr",
              fileIds: [101],
              webUrl: "https://crowdin.com/project/42/tasks/2001",
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/storages")) {
        return new Response(JSON.stringify({ data: { id: 55, fileName: "fr.json" } }), {
          status: 201,
        });
      }

      if (path.endsWith("/projects/42/translations/fr")) {
        return new Response(
          JSON.stringify({
            data: { projectId: 42, storageId: 55, languageId: "fr", fileId: 101 },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/42/translations/builds") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: 77,
              projectId: 42,
              status: "finished",
              progress: 100,
              createdAt: "2026-05-22T00:00:00Z",
              updatedAt: "2026-05-22T00:00:01Z",
              finishedAt: "2026-05-22T00:00:01Z",
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/42/translations/builds/77")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 77,
              projectId: 42,
              status: "finished",
              progress: 100,
              createdAt: "2026-05-22T00:00:00Z",
              updatedAt: "2026-05-22T00:00:01Z",
              finishedAt: "2026-05-22T00:00:01Z",
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/42/translations/builds/77/download")) {
        return new Response(
          JSON.stringify({
            data: { url: "https://downloads.crowdin.test/build-77.zip" },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await pushCrowdinTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "crowdin",
      externalProjectId: "42",
      externalJobId: "2001",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.crowdin.test/api/v2",
      } as never,
      project: {} as never,
      secretMaterial: "token",
      translations: [{ locale: "fr", text: "Bonjour", fileId: "101", key: "hello" }],
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.asyncOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "crowdin_upload_translations", storageId: 55 }),
        expect.objectContaining({
          type: "crowdin_translation_build",
          buildId: 77,
          downloadUrl: "https://downloads.crowdin.test/build-77.zip",
        }),
      ]),
    );
  });

  it("reports missing file ids as failures and skips the build when nothing can be uploaded", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/projects/42/tasks/2001")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 2001,
              projectId: 42,
              type: 0,
              status: "in_progress",
              title: "French task",
              description: null,
              targetLanguageId: "fr",
              languageId: "fr",
              fileIds: null,
              webUrl: "https://crowdin.com/project/42/tasks/2001",
            },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await pushCrowdinTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "crowdin",
      externalProjectId: "42",
      externalJobId: "2001",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.crowdin.test/api/v2",
      } as never,
      project: {} as never,
      secretMaterial: "token",
      translations: [{ locale: "fr", text: "Bonjour", key: "hello" }],
    });

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      {
        locale: "fr",
        fileId: null,
        message: "crowdin_translation_missing_file_id",
      },
    ]);
    expect(result.asyncOperations).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports missing translation keys as failures", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/projects/42/tasks/2001")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 2001,
              projectId: 42,
              type: 0,
              status: "in_progress",
              title: "French task",
              description: null,
              targetLanguageId: "fr",
              languageId: "fr",
              fileIds: [101],
              webUrl: "https://crowdin.com/project/42/tasks/2001",
            },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await pushCrowdinTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "crowdin",
      externalProjectId: "42",
      externalJobId: "2001",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.crowdin.test/api/v2",
      } as never,
      project: {} as never,
      secretMaterial: "token",
      translations: [{ locale: "fr", text: "Bonjour", fileId: "101" }],
    });

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      {
        locale: "fr",
        fileId: "101",
        message: "crowdin_translation_missing_key",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
