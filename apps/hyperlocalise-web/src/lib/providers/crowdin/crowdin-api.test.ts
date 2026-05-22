import { describe, expect, it, vi } from "vite-plus/test";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

describe("CrowdinApiClient", () => {
  function createClient(fetchFn: typeof fetch) {
    return new CrowdinApiClient({
      token: "test-token",
      baseUrl: "https://api.crowdin.test/api/v2",
      fetchFn,
    });
  }

  it("lists projects with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("offset=0")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1,
                  name: "Project One",
                  identifier: "project-one",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["fr", "de"],
                  webUrl: "https://crowdin.com/project/project-one",
                  isSuspended: false,
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: [],
          pagination: { offset: 500, limit: 500 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const projects = await client.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: 1,
      name: "Project One",
      identifier: "project-one",
      sourceLanguageId: "en",
      targetLanguageIds: ["fr", "de"],
      webUrl: "https://crowdin.com/project/project-one",
      isSuspended: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gets a single project", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            id: 42,
            name: "Docs",
            identifier: "docs",
            sourceLanguageId: "en",
            targetLanguageIds: ["ja"],
            webUrl: "https://crowdin.com/project/docs",
            isSuspended: false,
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const project = await client.getProject(42);

    expect(project.id).toBe(42);
    expect(project.name).toBe("Docs");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crowdin.test/api/v2/projects/42",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      }),
    );
  });

  it("lists branches for a project", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            { data: { id: 10, name: "main", title: "Main Branch" } },
            { data: { id: 11, name: "feature/i18n", title: null } },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const branches = await client.listBranches(1);

    expect(branches).toHaveLength(2);
    expect(branches[0]).toMatchObject({ id: 10, name: "main", title: "Main Branch" });
    expect(branches[1]).toMatchObject({ id: 11, name: "feature/i18n", title: null });
  });

  it("lists branches with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("offset=0")) {
        return new Response(
          JSON.stringify({
            data: [{ data: { id: 10, name: "main", title: "Main Branch" } }],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: [],
          pagination: { offset: 500, limit: 500 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const branches = await client.listBranches(1);

    expect(branches).toHaveLength(1);
    expect(branches[0]).toMatchObject({ id: 10, name: "main", title: "Main Branch" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws CrowdinApiError on 401", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { code: 401, message: "Unauthorized" } }), {
        status: 401,
      });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.listProjects()).rejects.toBeInstanceOf(CrowdinApiError);
    await expect(client.listProjects()).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws CrowdinApiError on 500", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.listProjects()).rejects.toBeInstanceOf(CrowdinApiError);
    await expect(client.listProjects()).rejects.toMatchObject({
      status: 500,
      responseBody: { error: "Internal Server Error" },
    });
  });

  it("uses the default base URL when none is provided", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new CrowdinApiClient({ token: "test", fetchFn: fetchMock });
    await client.listProjects();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crowdin.com/api/v2/projects?limit=500&offset=0",
      expect.anything(),
    );
  });

  it("trims trailing slashes from baseUrl", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new CrowdinApiClient({
      token: "test",
      baseUrl: "https://enterprise.crowdin.com/api/v2///",
      fetchFn: fetchMock,
    });
    await client.listProjects();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://enterprise.crowdin.com/api/v2/projects?limit=500&offset=0",
      expect.anything(),
    );
  });

  it("lists directories for a project", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              data: {
                id: 1,
                branchId: 10,
                directoryId: null,
                name: "locales",
                title: "Locales",
                exportPattern: null,
                path: "/locales",
              },
            },
            {
              data: {
                id: 2,
                branchId: 10,
                directoryId: 1,
                name: "en",
                title: null,
                exportPattern: null,
                path: "/locales/en",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const directories = await client.listDirectories(1, 10);

    expect(directories).toHaveLength(2);
    expect(directories[0]).toMatchObject({ id: 1, name: "locales", branchId: 10 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crowdin.test/api/v2/projects/1/directories?limit=500&offset=0&branchId=10",
      expect.anything(),
    );
  });

  it("lists files for a project", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              data: {
                id: 101,
                branchId: 10,
                directoryId: 2,
                name: "common.json",
                title: "Common Strings",
                type: "json",
                path: "/locales/en/common.json",
                status: "active",
                revisionId: 5,
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const files = await client.listFiles(1, 10, 2);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ id: 101, name: "common.json", type: "json", revisionId: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/projects/1/files?"),
      expect.anything(),
    );
  });

  it("lists file revisions", async () => {
    const fetchMock = vi.fn(async () => {
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
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const revisions = await client.listFileRevisions(1, 101);

    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ id: 50, fileId: 101, info: { addedStrings: 2 } });
  });

  it("lists source strings", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              data: {
                id: 1001,
                projectId: 1,
                fileId: 101,
                branchId: 10,
                directoryId: 2,
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
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const strings = await client.listSourceStrings(1, 101);

    expect(strings).toHaveLength(1);
    expect(strings[0]).toMatchObject({ id: 1001, identifier: "hello", fileId: 101 });
  });

  it("lists tasks", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              data: {
                id: 2001,
                projectId: 1,
                type: "translate",
                status: "in_progress",
                title: "French translations",
                description: "Translate homepage",
                languageId: "fr",
                fileIds: [101],
                assignees: [{ id: 1, username: "translator1" }],
                deadline: "2026-06-01T00:00:00Z",
                webUrl: "https://crowdin.com/project/1/tasks/2001",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const tasks = await client.listTasks(1);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 2001,
      title: "French translations",
      status: "in_progress",
    });
  });

  it("lists project language progress", async () => {
    const fetchMock = vi.fn(async () => {
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
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const progress = await client.listProjectLanguageProgress(1);

    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      languageId: "fr",
      translationProgress: 80,
      approvalProgress: 60,
    });
  });
});
