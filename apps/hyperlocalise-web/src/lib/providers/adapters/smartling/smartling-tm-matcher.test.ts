import { describe, expect, it, vi } from "vite-plus/test";

import { searchSmartlingTranslationMemoryMatches } from "./smartling-tm-matcher";

describe("searchSmartlingTranslationMemoryMatches", () => {
  it("normalizes TM entry matches for attached memories", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/translation-memories/tm-uid-1/entries")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    entryUid: "entry-1",
                    sourceText: "Hello",
                    sourceLocaleId: "en-US",
                    translations: [{ targetLocaleId: "fr-FR", translationText: "Bonjour" }],
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const matches = await searchSmartlingTranslationMemoryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "smartling",
      externalProjectId: "project-smartling",
      credential: { baseUrl: null } as never,
      secretMaterial: JSON.stringify({
        userIdentifier: "user",
        userSecret: "secret",
        accountUid: "acct-1",
      }),
      memory: {
        id: "memory_local_1",
        name: "Product TM",
        externalMemoryId: "tm-uid-1",
        capabilityMode: "synced_import",
      },
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Hello",
      limit: 5,
    });

    vi.unstubAllGlobals();

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      memoryId: "memory_local_1",
      sourceText: "Hello",
      targetText: "Bonjour",
      providerKind: "smartling",
      matchSource: "live_provider",
      externalResourceId: "tm-uid-1",
      externalSegmentId: "entry-1",
    });
  });

  it("returns no matches when external memory id is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const matches = await searchSmartlingTranslationMemoryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "smartling",
      externalProjectId: "project-smartling",
      credential: { baseUrl: null } as never,
      secretMaterial: JSON.stringify({
        userIdentifier: "user",
        userSecret: "secret",
        accountUid: "acct-1",
      }),
      memory: {
        id: "memory_local_1",
        name: "Product TM",
        externalMemoryId: null,
        capabilityMode: "synced_import",
      },
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Hello",
      limit: 5,
    });

    vi.unstubAllGlobals();

    expect(matches).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
