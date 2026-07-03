import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchCrowdinProjects } from "./crowdin-project-fetcher";

describe("fetchCrowdinProjects", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("lists projects without fetching branches", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/projects?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 42,
                  name: "Marketing",
                  identifier: "marketing",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["fr"],
                  webUrl: "https://crowdin.com/project/marketing",
                  isSuspended: false,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/branches?")) {
        throw new Error("branches should not be requested for project list");
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchCrowdinProjects({
      organizationId: "org-1",
      providerKind: "crowdin",
      credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
      secretMaterial: "test-token",
    });

    expect(result).toEqual([
      {
        externalProjectId: "42",
        name: "Marketing",
        sourceLocale: "en",
        targetLocales: ["fr"],
        externalProjectUrl: "https://crowdin.com/project/marketing",
        isActive: true,
        metadata: {
          identifier: "marketing",
        },
      },
    ]);
  });
});
