import { describe, expect, it, vi } from "vite-plus/test";

import { pullCrowdinProviderReview } from "./crowdin-review-puller";

describe("pullCrowdinProviderReview", () => {
  it("deduplicates string and task comments for repeated sync", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/projects/1/tasks/9/comments")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 5,
                  userId: 3,
                  taskId: 9,
                  text: "Task note",
                  createdAt: "2026-05-04T10:00:00Z",
                  updatedAt: "2026-05-04T10:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/projects/1/tasks/9") && !url.includes("/comments")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 9,
              projectId: 1,
              type: 0,
              status: "in_progress",
              title: "Review",
              description: null,
              languageId: "de",
              fileIds: [],
              assignees: null,
              deadline: null,
              webUrl: "https://crowdin.com/project/demo/tasks/9",
              stringIds: [100],
              targetLanguageId: "de",
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/projects/1") && !url.includes("/tasks/") && !url.includes("/comments")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 1,
              name: "Demo",
              identifier: "demo",
              sourceLanguageId: "en",
              targetLanguageIds: ["de"],
              webUrl: "https://crowdin.com/project/demo",
              isSuspended: false,
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/projects/1/comments")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 42,
                  text: "Issue text",
                  userId: 7,
                  stringId: 100,
                  languageId: "de",
                  type: "issue",
                  issueType: "translation_mistake",
                  issueStatus: "unresolved",
                  createdAt: "2026-05-01T10:00:00Z",
                  projectId: 1,
                },
              },
              {
                data: {
                  id: 42,
                  text: "Issue text duplicate",
                  userId: 7,
                  stringId: 100,
                  languageId: "de",
                  type: "issue",
                  issueType: "translation_mistake",
                  issueStatus: "unresolved",
                  createdAt: "2026-05-01T10:00:00Z",
                  projectId: 1,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const report = await pullCrowdinProviderReview({
      credential: {},
      secretMaterial: "token",
      fetchFn: fetchFn as typeof fetch,
      externalProjectId: "1",
      externalJobId: "9",
      content: {
        externalJobId: "9",
        targetLocales: ["de"],
        units: [
          {
            externalStringId: "100",
            key: "welcome.title",
            sourceText: "Hello",
            translations: [{ locale: "de", text: "Hallo" }],
          },
        ],
      },
    });

    expect(report.summary.total).toBe(2);
    expect(report.summary.byKind.issue).toBe(1);
    expect(report.summary.byKind.task_comment).toBe(1);
    expect(report.threads.some((thread) => thread.item?.key === "welcome.title")).toBe(true);
  });
});
