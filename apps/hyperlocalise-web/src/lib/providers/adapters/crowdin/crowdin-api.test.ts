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

  it("rejects unsafe base URLs before making requests", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    expect(
      () =>
        new CrowdinApiClient({
          token: "test",
          baseUrl: "https://169.254.169.254/api/v2",
          fetchFn: fetchMock,
        }),
    ).toThrow("Crowdin provider base URL is invalid or unsafe.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("manages project webhooks", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const method = init?.method;
      if (method === "GET") {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9,
                  projectId: 42,
                  name: "Hyperlocalise sync",
                  url: "https://app.example.test/api/webhooks/tms/crowdin",
                  events: ["file.updated"],
                  headers: { "X-Hyperlocalise-Provider-Webhook-Id": "9" },
                  payload: {},
                  isActive: true,
                  requestType: "POST",
                  contentType: "application/json",
                  batchingEnabled: false,
                  createdAt: "2026-05-28T00:00:00Z",
                  updatedAt: "2026-05-28T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: 10,
              projectId: 42,
              name: "Hyperlocalise sync",
              url: "https://app.example.test/api/webhooks/tms/crowdin",
              events: ["file.updated"],
              headers: {},
              payload: {},
              isActive: true,
              requestType: "POST",
              contentType: "application/json",
              batchingEnabled: false,
              createdAt: "2026-05-28T00:00:00Z",
              updatedAt: "2026-05-28T00:00:00Z",
            },
          }),
          { status: 200 },
        );
      }

      if (method === "PATCH") {
        return new Response(
          JSON.stringify({
            data: {
              id: 10,
              projectId: 42,
              name: "Hyperlocalise sync",
              url: "https://app.example.test/api/webhooks/tms/crowdin",
              events: ["file.updated", "task.statusChanged"],
              headers: { "X-Hyperlocalise-Provider-Webhook-Id": "10" },
              payload: {},
              isActive: true,
              requestType: "POST",
              contentType: "application/json",
              batchingEnabled: false,
              createdAt: "2026-05-28T00:00:00Z",
              updatedAt: "2026-05-28T00:00:00Z",
            },
          }),
          { status: 200 },
        );
      }

      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.listWebhooks(42)).resolves.toMatchObject([{ id: 9 }]);
    await expect(
      client.createWebhook(42, {
        name: "Hyperlocalise sync",
        url: "https://app.example.test/api/webhooks/tms/crowdin",
        events: ["file.updated"],
        requestType: "POST",
        contentType: "application/json",
        isActive: true,
      }),
    ).resolves.toMatchObject({ id: 10 });
    await expect(
      client.updateWebhook(42, 10, [
        { op: "replace", path: "/events", value: ["file.updated", "task.statusChanged"] },
      ]),
    ).resolves.toMatchObject({
      id: 10,
      events: ["file.updated", "task.statusChanged"],
    });
    await expect(client.deleteWebhook(42, 10)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.crowdin.test/api/v2/projects/42/webhooks?limit=500&offset=0",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.crowdin.test/api/v2/projects/42/webhooks",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.crowdin.test/api/v2/projects/42/webhooks/10",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.crowdin.test/api/v2/projects/42/webhooks/10",
      expect.objectContaining({ method: "DELETE" }),
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

  it("gets a source file download link", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            url: "https://downloads.crowdin.test/source.json",
            expireIn: "2026-06-03T00:00:00+00:00",
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const downloadLink = await client.downloadFile(1, 101);

    expect(downloadLink).toMatchObject({
      url: "https://downloads.crowdin.test/source.json",
      expireIn: "2026-06-03T00:00:00+00:00",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crowdin.test/api/v2/projects/1/files/101/download",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("lists source strings by fileId", async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(String(url)).toContain("/projects/1/strings?");
      expect(String(url)).toContain("fileId=101");
      expect(String(url)).not.toContain("stringIds=");
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
    const strings = await client.listSourceStrings(1, { fileId: 101 });

    expect(strings).toHaveLength(1);
    expect(strings[0]).toMatchObject({ id: 1001, identifier: "hello", fileId: 101 });
  });

  it("lists source strings by taskId", async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(String(url)).toContain("/projects/1/strings?");
      expect(String(url)).toContain("taskId=9");
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await client.listSourceStrings(1, { taskId: 9 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lists source strings by croql", async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(String(url)).toContain("croql=id+in+%281001%2C1002%29");
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await client.listSourceStrings(1, { croql: "id in (1001,1002)" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lists string comments for strings without languageId", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      expect(path).toContain("/projects/1/comments?stringId=1001&type=comment");
      expect(path).not.toContain("languageId=");
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await client.listStringCommentsForStrings(1, [1001], { type: "comment" });
  });

  it("lists translation approvals with fileId and languageId", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      expect(path).toContain("/projects/1/approvals?");
      expect(path).toContain("languageId=fr");
      expect(path).toContain("fileId=101");
      expect(path).not.toContain("stringIds=");
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await client.listTranslationApprovals(1, "fr", { fileId: 101 });
  });

  it("scopes translation approvals to source string files", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      expect(path).toContain("languageId=fr");
      expect(path).toContain("fileId=101");
      return new Response(
        JSON.stringify({
          data: [{ data: { id: 1, translationId: 9001, stringId: 1001, languageId: "fr" } }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const approvals = await client.listTranslationApprovalsForSourceStrings(1, "fr", [
      { id: 1001, fileId: 101 },
    ]);

    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.translationId).toBe(9001);
  });

  it("skips translation approvals when there are no source strings", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const approvals = await client.listTranslationApprovalsForSourceStrings(1, "fr", []);

    expect(approvals).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
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
                type: 0,
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

  it("gets a task and uploads translations through storage", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/projects/1/tasks/9")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 9,
              projectId: 1,
              type: 0,
              status: "todo",
              title: "Task",
              description: null,
              targetLanguageId: "fr",
              languageId: "fr",
              fileIds: [101],
              webUrl: "https://crowdin.com/project/1/tasks/9",
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/storages")) {
        return new Response(JSON.stringify({ data: { id: 12, fileName: "fr.json" } }), {
          status: 201,
        });
      }

      if (path.endsWith("/projects/1/translations/fr") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: { projectId: 1, storageId: 12, languageId: "fr", fileId: 101 },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const task = await client.getTask(1, 9);
    expect(task.targetLanguageId).toBe("fr");

    const storage = await client.addStorage({
      fileName: "fr.json",
      content: new TextEncoder().encode('{"hello":"Bonjour"}'),
      contentType: "application/json",
    });
    expect(storage.id).toBe(12);

    const upload = await client.uploadTranslations(1, "fr", {
      storageId: storage.id,
      fileId: 101,
    });
    expect(upload.fileId).toBe(101);
  });

  it("adds and replaces approved string translations", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/projects/1/translations") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          stringId: 1001,
          languageId: "fr",
          text: "Bonjour",
        });
        return new Response(
          JSON.stringify({
            data: {
              id: 9001,
              stringId: 1001,
              languageId: "fr",
              text: "Bonjour",
              createdAt: "2026-06-08T00:00:00Z",
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/1/translations") && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual([
          { op: "remove", path: "/9001" },
          {
            op: "add",
            path: "/-",
            value: {
              stringId: 1001,
              languageId: "fr",
              text: "Salut",
            },
          },
        ]);
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9001,
                  stringId: 1001,
                  languageId: "fr",
                  text: "Salut",
                  createdAt: "2026-06-08T00:01:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const added = await client.addTranslation(1, {
      stringId: 1001,
      languageId: "fr",
      text: "Bonjour",
    });
    const replaced = await client.replaceApprovedTranslation(1, {
      translationId: 9001,
      stringId: 1001,
      languageId: "fr",
      text: "Salut",
    });

    expect(added).toMatchObject({ id: 9001, text: "Bonjour" });
    expect(replaced).toMatchObject({ id: 9001, text: "Salut" });
  });

  it("fails approved translation replacements when Crowdin returns no added item", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const client = createClient(fetchMock as unknown as typeof fetch);

    await expect(
      client.replaceApprovedTranslation(1, {
        translationId: 9001,
        stringId: 1001,
        languageId: "fr",
        text: "Salut",
      }),
    ).rejects.toMatchObject({
      name: "CrowdinApiError",
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updates unapproved string translations", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/projects/1/translations") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: 9001,
              stringId: 1001,
              languageId: "fr",
              text: "Bonjour",
              createdAt: "2026-06-08T00:00:00Z",
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/1/translations") && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual([
          { op: "replace", path: "/9001/text", value: "Salut" },
        ]);
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9001,
                  stringId: 1001,
                  languageId: "fr",
                  text: "Salut",
                  createdAt: "2026-06-08T00:01:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const added = await client.addTranslation(1, {
      stringId: 1001,
      languageId: "fr",
      text: "Bonjour",
    });
    const updated = await client.updateTranslation(1, 9001, "Salut");

    expect(added).toMatchObject({ id: 9001, text: "Bonjour" });
    expect(updated).toMatchObject({ id: 9001, text: "Salut" });
  });

  it("fails translation updates when Crowdin returns no updated item", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const client = createClient(fetchMock as unknown as typeof fetch);

    await expect(client.updateTranslation(1, 9001, "Salut")).rejects.toMatchObject({
      name: "CrowdinApiError",
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails approved translation replacements when response text does not match", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9001,
                  stringId: 1001,
                  languageId: "fr",
                  text: "Different text",
                  createdAt: "2026-06-08T00:01:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const client = createClient(fetchMock as unknown as typeof fetch);

    await expect(
      client.replaceApprovedTranslation(1, {
        translationId: 9001,
        stringId: 1001,
        languageId: "fr",
        text: "Salut",
      }),
    ).rejects.toMatchObject({
      name: "CrowdinApiError",
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lists glossaries and translation memories with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/glossaries?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 7,
                  name: "Product glossary",
                  description: null,
                  languageId: "en",
                  languageIds: ["en", "fr"],
                  terms: 12,
                  projectIds: [42],
                  defaultProjectIds: [],
                  webUrl: "https://crowdin.com/glossary/7",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/tms?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9,
                  name: "Product TM",
                  description: null,
                  languageId: "en",
                  languageIds: ["en", "fr"],
                  segmentsCount: 100,
                  projectIds: [42],
                  defaultProjectIds: [],
                  webUrl: "https://crowdin.com/tm/9",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const glossaries = await client.listGlossaries();
    const memories = await client.listTranslationMemories();

    expect(glossaries).toHaveLength(1);
    expect(glossaries[0]?.projectIds).toEqual([42]);
    expect(memories).toHaveLength(1);
    expect(memories[0]?.segmentsCount).toBe(100);
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
