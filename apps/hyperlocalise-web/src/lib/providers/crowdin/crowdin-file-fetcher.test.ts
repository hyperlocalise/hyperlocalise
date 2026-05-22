import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchCrowdinFileKeys } from "./crowdin-file-fetcher";

describe("fetchCrowdinFileKeys", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized file and key metadata from Crowdin", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/branches?")) {
        return new Response(
          JSON.stringify({
            data: [{ data: { id: 10, name: "main", title: "Main" } }],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/directories?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1,
                  branchId: 10,
                  directoryId: null,
                  name: "locales",
                  title: null,
                  exportPattern: null,
                  path: "/locales",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: 10,
                  directoryId: 1,
                  name: "en.json",
                  title: "English",
                  type: "json",
                  path: "/locales/en.json",
                  status: "active",
                  revisionId: 5,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/revisions?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 50,
                  fileId: 101,
                  projectId: 1,
                  info: {
                    sourceLanguageId: "en",
                    addedStrings: 2,
                    removedStrings: 0,
                    updatedStrings: 1,
                  },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/strings?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1001,
                  projectId: 1,
                  fileId: 101,
                  branchId: 10,
                  directoryId: 1,
                  identifier: "hello",
                  text: "Hello",
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchCrowdinFileKeys({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      externalProjectId: "1",
      credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
      project: {} as never,
      secretMaterial: "test-token",
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalResourceId: "101",
          resourceType: "file",
          sourcePath: "main/locales/en.json",
          displayName: "English",
          format: "json",
          revision: "50",
          syncState: "synced",
        }),
        expect.objectContaining({
          externalResourceId: "1001",
          resourceType: "key",
          sourcePath: "main/locales/en.json/keys/hello",
          displayName: "hello",
        }),
      ]),
    );
  });

  it("throws on invalid project id", async () => {
    await expect(
      fetchCrowdinFileKeys({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "crowdin",
        externalProjectId: "not-a-number",
        credential: {} as never,
        project: {} as never,
        secretMaterial: "token",
      }),
    ).rejects.toThrow("invalid_crowdin_project_id");
  });

  it("throws crowdin_auth_invalid on 401", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/branches?")) {
        return new Response(JSON.stringify({ error: { code: 401, message: "Unauthorized" } }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    await expect(
      fetchCrowdinFileKeys({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "crowdin",
        externalProjectId: "1",
        credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
        project: {} as never,
        secretMaterial: "test-token",
      }),
    ).rejects.toThrow("crowdin_auth_invalid");
  });
});
