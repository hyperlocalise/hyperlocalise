import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchCrowdinProjectDetailMetadata } from "./crowdin-project-detail";

describe("fetchCrowdinProjectDetailMetadata", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("includes branch metadata for project detail", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/projects/42")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 42,
              name: "Marketing",
              identifier: "marketing",
              sourceLanguageId: "en",
              targetLanguageIds: ["fr"],
              webUrl: "https://crowdin.com/project/marketing",
              isSuspended: false,
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 10,
                  name: "main",
                  title: "Main Branch",
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

    const result = await fetchCrowdinProjectDetailMetadata({
      projectId: 42,
      token: "test-token",
      baseUrl: "https://api.crowdin.test/api/v2",
    });

    expect(result).toMatchObject({
      externalProjectId: "42",
      name: "Marketing",
      metadata: {
        identifier: "marketing",
        branches: [{ id: 10, name: "main", title: "Main Branch" }],
      },
    });
  });
});
