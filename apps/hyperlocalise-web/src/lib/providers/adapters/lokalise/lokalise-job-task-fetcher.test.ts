import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { lokaliseTmsProvider } from "./lokalise-provider";

describe("lokaliseTmsProvider.fetchJobTasks", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized job/task metadata from Lokalise", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("filter_statuses=created%2Cqueued%2Cin_progress")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            tasks: [
              {
                task_id: 55392,
                title: "French homepage",
                description: "Translate homepage keys",
                status: "in_progress",
                progress: 25,
                task_type: "translation",
                due_date: "2026-06-01 00:00:00 (Etc/UTC)",
                due_date_timestamp: 1780272000,
                source_language_iso: "en",
                keys_count: 3,
                words_count: 91,
                languages: [
                  {
                    language_iso: "fr",
                    language_id: 673,
                    language_name: "French",
                    status: "in progress",
                    progress: 80,
                    users: [
                      {
                        user_id: 421,
                        email: "translator@example.com",
                        fullname: "Jean Translator",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("filter_statuses=completed")) {
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await lokaliseTmsProvider.fetchJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      externalProjectId: "proj.123",
      credential: { baseUrl: "https://api.lokalise.test/api2" } as never,
      project: {} as never,
      secretMaterial: "test-token",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalJobId: "55392",
      externalStatus: "in_progress",
      title: "French homepage",
      targetLocales: ["fr"],
      assignedUsers: ["Jean Translator"],
      kind: "translation",
      externalUrl: "https://app.lokalise.com/project/proj.123/?task=55392",
    });
    expect(result[0]?.dueDate).toEqual(new Date(1780272000 * 1000));
    expect(result[0]?.providerPayload).toMatchObject({
      taskType: "translation",
      progress: 25,
      sourceLanguageIso: "en",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lokalise.test/api2/projects/proj.123/tasks?page=1&limit=500&filter_statuses=created%2Cqueued%2Cin_progress",
      expect.objectContaining({
        method: "GET",
        headers: { "X-Api-Token": "test-token" },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lokalise.test/api2/projects/proj.123/tasks?page=1&limit=500&filter_statuses=completed",
      expect.objectContaining({
        method: "GET",
        headers: { "X-Api-Token": "test-token" },
      }),
    );
  });

  it("maps review tasks to review kind", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          tasks: [
            {
              task_id: 99,
              title: "QA pass",
              status: "queued",
              task_type: "review",
              languages: [],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await lokaliseTmsProvider.fetchJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      externalProjectId: "proj.123",
      credential: {} as never,
      project: {} as never,
      secretMaterial: "token",
    });

    expect(result[0]?.kind).toBe("review");
  });

  it("throws lokalise_auth_invalid on 401", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
        status: 401,
      });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    await expect(
      lokaliseTmsProvider.fetchJobTasks({
        organizationId: "org-1",
        projectId: "project-1",
        externalProjectId: "proj.123",
        credential: {} as never,
        project: {} as never,
        secretMaterial: "bad-token",
      }),
    ).rejects.toThrow("lokalise_auth_invalid");
  });
});
