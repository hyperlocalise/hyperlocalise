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
});
