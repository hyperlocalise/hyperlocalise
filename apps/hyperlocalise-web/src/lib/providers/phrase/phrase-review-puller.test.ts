import { describe, expect, it, vi } from "vite-plus/test";

import { pullPhraseProviderReview } from "./phrase-review-puller";

describe("pullPhraseProviderReview", () => {
  it("deduplicates threads across repeated sync pulls", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/api2/v2/projects/") && path.includes("/jobs")) {
        const workflowLevel = Number(new URL(path).searchParams.get("workflowLevel"));
        if (workflowLevel === 1) {
          return new Response(
            JSON.stringify({
              content: [
                {
                  uid: "job-fr",
                  innerId: "phrase-job-1",
                  status: "NEW",
                  targetLang: "fr-FR",
                  filename: "Homepage",
                },
              ],
              totalPages: 1,
            }),
            { status: 200 },
          );
        }

        return new Response(JSON.stringify({ content: [], totalPages: 0 }), { status: 200 });
      }

      if (path.includes("/conversations/lqas")) {
        return new Response(
          JSON.stringify({
            conversations: [
              {
                id: "lqa-1",
                lqaDescription: "Wrong tense",
                deleted: false,
                dateCreated: "2026-05-01T10:00:00Z",
                status: { name: "unresolved" },
                comments: [
                  {
                    id: "lqa-comment-1",
                    text: "Please fix",
                    dateCreated: "2026-05-01T10:00:00Z",
                  },
                  {
                    id: "lqa-comment-1",
                    text: "Please fix duplicate",
                    dateCreated: "2026-05-01T10:00:00Z",
                  },
                ],
                references: {
                  segmentId: "segment-1",
                  lqa: [{ errorCategoryId: 1, severityId: 2 }],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/conversations/plains")) {
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      }

      if (path.includes("/keys/key-1/comments") && !path.includes("/replies")) {
        return new Response(
          JSON.stringify([
            {
              id: "strings-comment-1",
              message: "FYI",
              has_replies: false,
              created_at: "2026-05-02T10:00:00Z",
              locales: [{ id: "locale-fr", name: "French", code: "fr" }],
            },
          ]),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const report = await pullPhraseProviderReview({
      credential: { region: "eu" },
      secretMaterial: "token",
      fetchFn: fetchFn as typeof fetch,
      externalProjectId: "strings-project-1",
      externalJobId: "phrase-job-1-task-fr-fr",
      project: {
        providerMetadata: {
          stringsProjectId: "strings-project-1",
          tmsProjectUid: "tms-project-1",
          accountSlug: "acme",
          slug: "demo",
        },
      } as never,
      content: {
        externalJobId: "phrase-job-1-task-fr-fr",
        targetLocales: ["fr-FR"],
        units: [
          {
            externalStringId: "key-1",
            key: "welcome.title",
            sourceText: "Hello",
            translations: [{ locale: "fr-FR", text: "Bonjour" }],
          },
        ],
      },
    });

    expect(report.summary.total).toBe(2);
    expect(report.summary.byKind.issue).toBe(1);
    expect(report.summary.byKind.comment).toBe(1);
    expect(report.threads.some((thread) => thread.item?.key === "welcome.title")).toBe(true);
  });
});
