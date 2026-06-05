import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildLokaliseProjectUrl,
  buildLokaliseTaskUrl,
  collectLokaliseTaskAssignees,
  collectLokaliseTaskKeyIds,
  collectLokaliseTaskTargetLocales,
  extractLokaliseKeyName,
  getLokaliseTaskCompletionMs,
  isLokaliseTaskCompletedAfter,
  inferFormatFromFilename,
  listLokaliseFilenameEntries,
  LokaliseApiClient,
  LokaliseApiError,
  LokaliseOAuthUserResolutionError,
  parseLokaliseTaskDueDate,
  partitionLokaliseLocales,
  summarizeLokaliseBulkUpdateChunkResult,
} from "./lokalise-api";

describe("LokaliseApiClient", () => {
  function createClient(fetchFn: typeof fetch) {
    return new LokaliseApiClient({
      token: "test-token",
      baseUrl: "https://api.lokalise.test/api2",
      fetchFn,
    });
  }

  it("lists projects with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/projects?page=1")) {
        return new Response(
          JSON.stringify({
            projects: [
              {
                project_id: "proj.123",
                name: "Marketing Website",
                project_type: "localization_files",
                team_id: 42,
                base_language_id: 640,
                base_language_iso: "en",
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const projects = await client.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      projectId: "proj.123",
      name: "Marketing Website",
      projectType: "localization_files",
      teamId: 42,
      baseLanguageId: 640,
      baseLanguageIso: "en",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lokalise.test/api2/projects?page=1&limit=100",
      expect.objectContaining({
        headers: { "X-Api-Token": "test-token" },
      }),
    );
  });

  it("resolves OAuth user identity from contributors/me in an accessible project", async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/projects?page=1")) {
        return new Response(
          JSON.stringify({
            projects: [{ project_id: "proj.123", name: "Marketing Website" }],
          }),
          { status: 200 },
        );
      }
      if (href.endsWith("/projects/proj.123/contributors/me")) {
        return new Response(
          JSON.stringify({
            contributor: {
              user_id: 98765,
              email: "lokalise-user@example.com",
              fullname: "Lokalise User",
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "unexpected_url", url: href }), {
        status: 500,
      });
    }) as unknown as typeof fetch;

    const identity = await createClient(fetchMock).resolveOAuthUserIdentity();

    expect(identity).toEqual({
      id: 98765,
      username: "lokalise-user@example.com",
      email: "lokalise-user@example.com",
      fullName: "Lokalise User",
    });
  });

  it("continues resolving OAuth user identity after a per-project API error", async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/projects?page=1")) {
        return new Response(
          JSON.stringify({
            projects: [
              { project_id: "proj.inaccessible", name: "Inaccessible Project" },
              { project_id: "proj.accessible", name: "Accessible Project" },
            ],
          }),
          { status: 200 },
        );
      }
      if (href.endsWith("/projects/proj.inaccessible/contributors/me")) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      if (href.endsWith("/projects/proj.accessible/contributors/me")) {
        return new Response(
          JSON.stringify({
            contributor: {
              user_id: 98765,
              email: "lokalise-user@example.com",
              fullname: "Lokalise User",
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "unexpected_url", url: href }), {
        status: 500,
      });
    }) as unknown as typeof fetch;

    const identity = await createClient(fetchMock).resolveOAuthUserIdentity();

    expect(identity.id).toBe(98765);
  });

  it("surfaces Lokalise API errors when OAuth user identity cannot be resolved", async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/projects?page=1")) {
        return new Response(
          JSON.stringify({
            projects: [{ project_id: "proj.123", name: "Marketing Website" }],
          }),
          { status: 200 },
        );
      }
      if (href.endsWith("/projects/proj.123/contributors/me")) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      return new Response(JSON.stringify({ error: "unexpected_url", url: href }), {
        status: 500,
      });
    }) as unknown as typeof fetch;

    await expect(createClient(fetchMock).resolveOAuthUserIdentity()).rejects.toBeInstanceOf(
      LokaliseApiError,
    );
    await expect(createClient(fetchMock).resolveOAuthUserIdentity()).rejects.toMatchObject({
      status: 403,
    });
  });

  it("reports no_projects when OAuth identity cannot be resolved without accessible projects", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(createClient(fetchMock).resolveOAuthUserIdentity()).rejects.toBeInstanceOf(
      LokaliseOAuthUserResolutionError,
    );
    await expect(createClient(fetchMock).resolveOAuthUserIdentity()).rejects.toMatchObject({
      code: "no_projects",
    });
  });

  it("uses Authorization for OAuth bearer tokens", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new LokaliseApiClient({
      token: "Bearer oauth-token",
      baseUrl: "https://api.lokalise.test/api2",
      fetchFn: fetchMock,
    });
    await client.listProjects();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lokalise.test/api2/projects?page=1&limit=100",
      expect.objectContaining({
        headers: { Authorization: "Bearer oauth-token" },
      }),
    );
  });

  it("rejects unsafe base URLs before making requests", () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    expect(
      () =>
        new LokaliseApiClient({
          token: "test-token",
          baseUrl: "https://127.0.0.1/api2",
          fetchFn: fetchMock,
        }),
    ).toThrow("Lokalise provider base URL is invalid or unsafe.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists project languages with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/projects/proj.123/languages")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            languages: [
              { lang_id: 640, lang_iso: "en", lang_name: "English", is_rtl: false },
              { lang_id: 673, lang_iso: "fr", lang_name: "French", is_rtl: false },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ languages: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const languages = await client.listProjectLanguages("proj.123");

    expect(languages).toHaveLength(2);
    expect(languages[0]).toMatchObject({ langId: 640, langIso: "en", langName: "English" });
    expect(languages[1]).toMatchObject({ langId: 673, langIso: "fr", langName: "French" });
  });

  it("lists keys with cursor pagination and translations", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/keys?") && !String(url).includes("cursor=")) {
        const headers = new Headers({
          "X-Pagination-Next-Cursor": "next-page",
        });
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            keys: [
              {
                key_id: 4242,
                key_name: { web: "home.hero.title", ios: "", android: "", other: "" },
                filenames: { web: "locales/en/home.json", ios: "", android: "", other: "" },
                platforms: ["web"],
                tags: ["app"],
                translations: [
                  {
                    translation_id: 1,
                    key_id: 4242,
                    language_iso: "fr",
                    translation: "Bonjour",
                    is_reviewed: true,
                    is_unverified: false,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers },
        );
      }

      if (String(url).includes("cursor=next-page")) {
        return new Response(JSON.stringify({ project_id: "proj.123", keys: [] }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ keys: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const keys = await client.listKeys("proj.123");

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      keyId: 4242,
      platforms: ["web"],
      tags: ["app"],
      translations: [
        expect.objectContaining({
          languageIso: "fr",
          translation: "Bonjour",
          isReviewed: true,
        }),
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lists tasks with pagination and status filters", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/projects/proj.123/tasks?page=1")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            tasks: [
              {
                task_id: 42,
                title: "Homepage",
                status: "queued",
                task_type: "translation",
                languages: [
                  {
                    language_iso: "de",
                    language_id: 666,
                    language_name: "German",
                    users: [{ user_id: 1, email: "de@example.com", fullname: "DE User" }],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const tasks = await client.listTasks("proj.123", {
      filterStatuses: ["created", "queued", "in_progress"],
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskId: 42,
      title: "Homepage",
      status: "queued",
      taskType: "translation",
    });
    expect(collectLokaliseTaskTargetLocales(tasks[0]!)).toEqual(["de"]);
    expect(collectLokaliseTaskAssignees(tasks[0]!)).toEqual(["DE User"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lokalise.test/api2/projects/proj.123/tasks?page=1&limit=500&filter_statuses=created%2Cqueued%2Cin_progress",
      expect.objectContaining({
        headers: { "X-Api-Token": "test-token" },
      }),
    );
  });

  it("filters completed tasks by completion time and caps pagination", async () => {
    const recentCompletedAt = Math.floor(Date.now() / 1000) - 60;
    const staleCompletedAt = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 60;

    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      if (!path.includes("filter_statuses=completed")) {
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }

      if (path.includes("page=1")) {
        return new Response(
          JSON.stringify({
            tasks: [
              {
                task_id: 1,
                title: "Recent",
                status: "completed",
                completed_at_timestamp: recentCompletedAt,
              },
              {
                task_id: 2,
                title: "Stale",
                status: "completed",
                completed_at_timestamp: staleCompletedAt,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const tasks = await client.listTasks("proj.123", {
      filterStatuses: ["completed"],
      maxPages: 1,
      completedAfterMs: cutoffMs,
    });

    expect(tasks.map((task) => task.taskId)).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches the next page when a full page has only stale completed tasks", async () => {
    const recentCompletedAt = Math.floor(Date.now() / 1000) - 60;
    const staleCompletedAt = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 60;
    const stalePage = Array.from({ length: 500 }, (_, index) => ({
      task_id: index + 100,
      title: `Stale ${index}`,
      status: "completed",
      completed_at_timestamp: staleCompletedAt,
    }));

    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      if (!path.includes("filter_statuses=completed")) {
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }

      if (path.includes("page=1")) {
        return new Response(JSON.stringify({ tasks: stalePage }), { status: 200 });
      }

      if (path.includes("page=2")) {
        return new Response(
          JSON.stringify({
            tasks: [
              {
                task_id: 99,
                title: "Recent on page two",
                status: "completed",
                completed_at_timestamp: recentCompletedAt,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const tasks = await client.listTasks("proj.123", {
      filterStatuses: ["completed"],
      maxPages: 2,
      completedAfterMs: cutoffMs,
    });

    expect(tasks.map((task) => task.taskId)).toEqual([99]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves per-language key ids from detailed task responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          task: {
            task_id: 42,
            title: "Homepage",
            status: "in_progress",
            languages: [
              { language_iso: "fr", keys: [100, 200] },
              { language_iso: "de", keys: [200, 300] },
            ],
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const task = await client.getTask("proj.123", 42);

    expect(collectLokaliseTaskKeyIds(task).sort((a, b) => a - b)).toEqual([100, 200, 300]);
    expect(task.languages[0]?.keyIds).toEqual([100, 200]);
  });

  it("throws LokaliseApiError on auth failure", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
        status: 401,
      });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.listProjects()).rejects.toBeInstanceOf(LokaliseApiError);
    await expect(client.listProjects()).rejects.toMatchObject({ status: 401 });
  });

  it("lists and creates key comments", async () => {
    let createCalls = 0;
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/keys/4242/comments") && method === "GET") {
        return new Response(
          JSON.stringify({
            comments: [
              {
                comment_id: 10,
                key_id: 4242,
                comment: "Existing note",
                added_by: 1,
                added_by_email: "reviewer@example.com",
                added_at: "2026-05-01T10:00:00Z",
                added_at_timestamp: 1746093600,
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys/4242/comments") && method === "POST") {
        createCalls += 1;
        return new Response(
          JSON.stringify({
            comments: [
              {
                comment_id: 11,
                key_id: 4242,
                comment: "New note",
                added_by: 2,
                added_by_email: "agent@example.com",
                added_at: "2026-05-02T10:00:00Z",
                added_at_timestamp: 1746180000,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ comments: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const listed = await client.listKeyComments("proj.123", 4242);
    const created = await client.createKeyComments("proj.123", 4242, [{ comment: "New note" }]);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ commentId: 10, comment: "Existing note" });
    expect(createCalls).toBe(1);
    expect(created[0]).toMatchObject({ commentId: 11, comment: "New note" });
  });
});

describe("summarizeLokaliseBulkUpdateChunkResult", () => {
  it("counts only successful keys when the bulk response reports per-key errors", () => {
    const chunk = [
      {
        keyId: 4242,
        translations: [{ languageIso: "fr", translation: "Bonjour" }],
      },
      {
        keyId: 9999,
        translations: [{ languageIso: "fr", translation: "Échec" }],
      },
    ];

    const result = summarizeLokaliseBulkUpdateChunkResult(chunk, {
      keys: [{ key_id: 4242 }],
      errors: [{ message: "Key not found", key: { key_id: 9999 } }],
    });

    expect(result).toMatchObject({
      uploaded: 1,
      failed: 1,
      failedKeyCount: 1,
      failures: [{ locale: "fr", message: "Key not found" }],
    });
  });
});

describe("partitionLokaliseLocales", () => {
  it("uses base language metadata to split source and target locales", () => {
    const { sourceLocale, targetLocales } = partitionLokaliseLocales(
      { baseLanguageId: 640, baseLanguageIso: "en" },
      [
        { langId: 640, langIso: "en", langName: "English", isRtl: false },
        { langId: 673, langIso: "fr", langName: "French", isRtl: false },
      ],
    );

    expect(sourceLocale).toBe("en");
    expect(targetLocales).toEqual(["fr"]);
  });

  it("returns no target locales when the source language cannot be determined", () => {
    const { sourceLocale, targetLocales } = partitionLokaliseLocales(
      { baseLanguageId: null, baseLanguageIso: null },
      [
        { langId: 640, langIso: "en", langName: "English", isRtl: false },
        { langId: 673, langIso: "fr", langName: "French", isRtl: false },
      ],
    );

    expect(sourceLocale).toBeNull();
    expect(targetLocales).toEqual([]);
  });
});

describe("buildLokaliseProjectUrl", () => {
  it("builds the app URL for a project", () => {
    expect(buildLokaliseProjectUrl("proj.123")).toBe("https://app.lokalise.com/project/proj.123/");
  });
});

describe("buildLokaliseTaskUrl", () => {
  it("builds the app URL for a task", () => {
    expect(buildLokaliseTaskUrl("proj.123", 55392)).toBe(
      "https://app.lokalise.com/project/proj.123/?task=55392",
    );
  });
});

describe("isLokaliseTaskCompletedAfter", () => {
  it("uses completed_at_timestamp when available", () => {
    const task = {
      taskId: 1,
      title: "Done",
      description: null,
      status: "completed",
      progress: 100,
      taskType: "translation",
      dueDate: null,
      dueDateTimestamp: null,
      sourceLanguageIso: null,
      languages: [],
      keysCount: 0,
      wordsCount: 0,
      createdAt: null,
      createdAtTimestamp: null,
      completedAt: null,
      completedAtTimestamp: 1_700_000_000,
    };

    expect(isLokaliseTaskCompletedAfter(task, 1_699_000_000_000)).toBe(true);
    expect(isLokaliseTaskCompletedAfter(task, 1_701_000_000_000)).toBe(false);
    expect(getLokaliseTaskCompletionMs(task)).toBe(1_700_000_000_000);
  });
});

describe("parseLokaliseTaskDueDate", () => {
  it("prefers due_date_timestamp when present", () => {
    const dueDate = parseLokaliseTaskDueDate({
      taskId: 1,
      title: "Task",
      description: null,
      status: "queued",
      progress: 0,
      taskType: "translation",
      dueDate: null,
      dueDateTimestamp: 1_700_000_000,
      sourceLanguageIso: null,
      languages: [],
      keysCount: 0,
      wordsCount: 0,
      createdAt: null,
      createdAtTimestamp: null,
      completedAt: null,
      completedAtTimestamp: null,
    });

    expect(dueDate).toEqual(new Date(1_700_000_000 * 1000));
  });
});

describe("lokalise key helpers", () => {
  it("prefers web key names and lists filename entries", () => {
    expect(
      extractLokaliseKeyName({
        web: "home.hero.title",
        ios: "ios.title",
        android: "",
        other: "",
      }),
    ).toBe("home.hero.title");

    expect(
      listLokaliseFilenameEntries({
        web: "locales/en/home.json",
        ios: "",
        android: "strings.xml",
        other: "",
      }),
    ).toEqual([
      { platform: "web", filename: "locales/en/home.json" },
      { platform: "android", filename: "strings.xml" },
    ]);
  });

  it("infers format from filename extension", () => {
    expect(inferFormatFromFilename("locales/en/home.json")).toBe("json");
    expect(inferFormatFromFilename("no-extension")).toBeNull();
  });
});
