import { describe, expect, it, vi } from "vite-plus/test";

import { lokaliseTmsProvider } from "./lokalise-provider";

describe("lokaliseTmsProvider.pullReview", () => {
  it("pulls task-scoped key comments into a review report", async () => {
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
                comment: "Needs review",
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
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "4242",
            key: "welcome.title",
            sourceText: "Hello",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
        ],
      },
      fetchFn: fetchFn as typeof fetch,
    } as never);

    expect(report.threads).toHaveLength(1);
    expect(report.threads[0]).toMatchObject({
      kind: "comment",
      item: {
        externalStringId: "4242",
        key: "welcome.title",
      },
      providerContext: {
        externalCommentId: "42",
      },
    });
  });

  it("throws lokalise_auth_invalid when listKeyComments returns 401", async () => {
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
        return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
          status: 401,
        });
      }

      return new Response("Not Found", { status: 404 });
    });

    await expect(
      lokaliseTmsProvider.pullReview({
        credential: { baseUrl: "https://api.lokalise.test/api2" } as never,
        secretMaterial: "token",
        externalProjectId: "proj.123",
        externalJobId: "55392",
        content: {
          externalJobId: "55392",
          targetLocales: ["fr"],
          units: [
            {
              externalStringId: "4242",
              key: "welcome.title",
              sourceText: "Hello",
              translations: [{ locale: "fr", text: "Bonjour" }],
            },
          ],
        },
        fetchFn: fetchFn as typeof fetch,
      } as never),
    ).rejects.toThrow("lokalise_auth_invalid");
  });
});
