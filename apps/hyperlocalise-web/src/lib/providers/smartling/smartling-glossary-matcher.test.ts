import { describe, expect, it, vi } from "vite-plus/test";

import { searchSmartlingGlossaryMatches } from "./smartling-glossary-matcher";

describe("searchSmartlingGlossaryMatches", () => {
  it("normalizes live glossary matches for attached glossaries", async () => {
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

      if (String(url).includes("/entries/search")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    entryUid: "entry-1",
                    term: "Save",
                    translations: [{ localeId: "fr-FR", term: "Enregistrer" }],
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

    const matches = await searchSmartlingGlossaryMatches({
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
      glossaries: [
        {
          id: "glossary_local_1",
          name: "Product glossary",
          externalGlossaryId: "glossary-uid-1",
          targetLocale: "fr-FR",
          termCapabilities: { mode: "live_search" },
        },
      ],
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Save your work",
      limit: 5,
    });

    vi.unstubAllGlobals();

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      glossaryId: "glossary_local_1",
      sourceTerm: "Save",
      targetTerm: "Enregistrer",
      providerKind: "smartling",
      matchSource: "live_provider",
      externalResourceId: "glossary-uid-1",
      externalTermId: "entry-1",
    });
  });

  it("returns no matches when the glossary is not attached", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const matches = await searchSmartlingGlossaryMatches({
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
      glossaries: [
        {
          id: "glossary_local_1",
          name: "Product glossary",
          externalGlossaryId: null,
          targetLocale: "fr-FR",
          termCapabilities: { mode: "live_search" },
        },
      ],
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Save your work",
      limit: 5,
    });

    vi.unstubAllGlobals();

    expect(matches).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
