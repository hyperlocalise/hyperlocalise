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

  it("returns normalized file metadata from Crowdin", async () => {
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
              {
                data: {
                  id: 40,
                  fileId: 101,
                  projectId: 1,
                  info: {
                    sourceLanguageId: "en",
                    addedStrings: 1,
                    removedStrings: 0,
                    updatedStrings: 0,
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

    expect(result).toEqual([
      expect.objectContaining({
        externalResourceId: "101",
        resourceType: "file",
        sourcePath: "main/locales/en.json",
        displayName: "English",
        format: "json",
        revision: "50",
        externalUrl: "https://api.crowdin.test/project/1/files/101",
        syncState: "synced",
      }),
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/strings?"),
      expect.anything(),
    );
  });

  it("builds file external URLs from the credential base URL", async () => {
    async function fetchFileExternalUrl(baseUrl: string | null) {
      const fetchMock = vi.fn(async (url) => {
        const path = String(url);

        if (path.includes("/files?")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  data: {
                    id: 101,
                    branchId: null,
                    directoryId: null,
                    name: "en.json",
                    title: "English",
                    type: "json",
                    path: "/en.json",
                    status: "active",
                    revisionId: 5,
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
        credential: { baseUrl } as never,
        project: {} as never,
        secretMaterial: "test-token",
      });

      return result.find((item) => item.resourceType === "file")?.externalUrl;
    }

    await expect(fetchFileExternalUrl("https://your-org.crowdin.com/api/v2/")).resolves.toBe(
      "https://your-org.crowdin.com/project/1/files/101",
    );
    await expect(fetchFileExternalUrl("https://api.crowdin.com/api/v2")).resolves.toBe(
      "https://crowdin.com/project/1/files/101",
    );
  });

  it("does not list source strings when discovering files", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "en.json",
                  title: "English",
                  type: "json",
                  path: "/en.json",
                  status: "active",
                  revisionId: 5,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/strings?")) {
        throw new Error("Source strings should not be fetched for file discovery");
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

    expect(result).toEqual([
      expect.objectContaining({
        externalResourceId: "101",
        resourceType: "file",
        sourcePath: "en.json",
      }),
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/strings?"),
      expect.anything(),
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

  it("throws when a branch directory fetch fails", async () => {
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

      if (path.includes("/directories?") && path.includes("branchId=10")) {
        return new Response(JSON.stringify({ error: { message: "Rate limited" } }), {
          status: 429,
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
    ).rejects.toThrow("Crowdin API returned HTTP 429");
  });

  it("throws when the root file fetch fails", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/files?") && !path.includes("branchId=")) {
        return new Response(JSON.stringify({ error: { message: "Unavailable" } }), {
          status: 503,
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
    ).rejects.toThrow("Crowdin API returned HTTP 503");
  });
});
