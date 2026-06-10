import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pullCrowdinTaskContent } from "./crowdin-content-puller";

describe("pullCrowdinTaskContent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("pulls source strings and approved translations for a task", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/projects/42/tasks/2001") && init?.method !== "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: 2001,
              projectId: 42,
              type: 0,
              status: "in_progress",
              title: "French task",
              description: null,
              sourceLanguageId: "en",
              targetLanguageId: "fr",
              languageId: "fr",
              fileIds: [101],
              stringIds: null,
              assignees: null,
              deadline: null,
              webUrl: "https://crowdin.com/project/42/tasks/2001",
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/strings?") && path.includes("taskId=2001")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1001,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
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
      }

      if (
        path.includes("/projects/42/approvals?") &&
        path.includes("languageId=fr") &&
        path.includes("fileId=101")
      ) {
        return new Response(
          JSON.stringify({
            data: [{ data: { id: 1, translationId: 9001, stringId: 1001, languageId: "fr" } }],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/languages/fr/translations?") &&
        path.includes("stringIds=1001")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9001,
                  text: "Bonjour",
                  createdAt: "2026-05-22T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/42/tasks/2001/exports")) {
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pullCrowdinTaskContent({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "crowdin",
      externalProjectId: "42",
      externalJobId: "2001",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.crowdin.test/api/v2",
      } as never,
      project: {} as never,
      secretMaterial: "token",
    });

    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({
      externalStringId: "1001",
      key: "hello",
      sourceText: "Hello",
      translations: [{ locale: "fr", text: "Bonjour", isApproved: true }],
    });

    expect(
      fetchMock.mock.calls.some(
        ([url]) =>
          String(url).includes("/projects/42/strings?") && String(url).includes("taskId=2001"),
      ),
    ).toBe(true);

    const languageTranslationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/projects/42/languages/fr/translations?"),
    );
    expect(languageTranslationCalls).toHaveLength(1);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/projects/42/translations?stringId="),
      ),
    ).toBe(false);
  });
});
