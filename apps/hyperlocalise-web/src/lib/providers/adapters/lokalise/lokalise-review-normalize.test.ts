import { describe, expect, it, vi } from "vite-plus/test";

import { lokaliseTmsProvider } from "./lokalise-provider";

describe("pullReview comment normalization", () => {
  it("maps key comments into provider review threads", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/tasks/55392") && !url.includes("/comments")) {
        return new Response(
          JSON.stringify({
            task: {
              task_id: 55392,
              title: "Review",
              status: "in_progress",
              languages: [
                {
                  language_iso: "fr",
                  language_id: 673,
                  language_name: "French",
                  status: "created",
                  progress: 0,
                  users: [],
                  keys: [4242],
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/keys/4242/comments")) {
        return new Response(
          JSON.stringify({
            comments: [
              {
                comment_id: 42,
                key_id: 4242,
                comment: "Please review this translation",
                added_by: 7,
                added_by_email: "reviewer@example.com",
                added_at: "2026-05-01T10:00:00Z",
                added_at_timestamp: 1746093600,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    const report = await lokaliseTmsProvider.pullReview({
      credential: { baseUrl: "https://api.lokalise.test/api2" } as never,
      secretMaterial: "token",
      externalProjectId: "proj.123",
      externalJobId: "55392",
      content: {
        externalJobId: "55392",
        externalTaskId: "55392",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [],
        providerPayload: {},
      },
      fetchFn: fetchFn as typeof fetch,
    } as never);

    const thread = report?.threads[0];
    expect(thread?.kind).toBe("comment");
    expect(thread?.item).toMatchObject({
      externalStringId: "4242",
    });
    expect(thread?.comments[0]?.body).toBe("Please review this translation");
  });
});
