import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchCrowdinJobTasks } from "./crowdin-job-task-fetcher";

describe("fetchCrowdinJobTasks", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized job/task metadata from Crowdin", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/tasks?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 2001,
                  projectId: 1,
                  type: 0, // 0 = translate (Crowdin API uses integers, not strings)
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
      }

      if (path.includes("/languages/progress?")) {
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

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchCrowdinJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      externalProjectId: "1",
      credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
      project: {} as never,
      secretMaterial: "test-token",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalJobId: "2001",
      externalStatus: "in_progress",
      title: "French translations",
      targetLocales: ["fr"],
      assignedUsers: ["translator1"],
      kind: "translation",
    });
    expect(result[0]?.providerPayload).toMatchObject({
      localeReadiness: {
        translationProgress: 80,
        approvalProgress: 60,
      },
    });
  });

  it("throws on invalid project id", async () => {
    await expect(
      fetchCrowdinJobTasks({
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

  it("maps targetLanguageId when languageId is absent", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/tasks?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 2002,
                  projectId: 1,
                  type: 0,
                  status: "todo",
                  title: "German task",
                  description: "Translate UI",
                  languageId: null,
                  targetLanguageId: "de",
                  sourceLanguageId: "en",
                  fileIds: [],
                  assignees: [],
                  deadline: null,
                  webUrl: "https://crowdin.com/project/1/tasks/2002",
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

    const result = await fetchCrowdinJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      externalProjectId: "1",
      credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
      project: {} as never,
      secretMaterial: "test-token",
    });

    expect(result[0]?.targetLocales).toEqual(["de"]);
    expect(result[0]?.providerPayload).toMatchObject({
      sourceLanguageId: "en",
      targetLanguageId: "de",
      languageId: "de",
    });
  });

  it("throws crowdin_auth_invalid on 401", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/tasks?")) {
        return new Response(JSON.stringify({ error: { code: 401, message: "Unauthorized" } }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    await expect(
      fetchCrowdinJobTasks({
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
