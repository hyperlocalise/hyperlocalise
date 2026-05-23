import { describe, expect, it, vi } from "vite-plus/test";

import { searchLokaliseGlossaryMatches } from "./lokalise-glossary-matcher";

describe("searchLokaliseGlossaryMatches", () => {
  it("returns normalized matches only for synced glossaries", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/glossary-terms")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 10,
                term: "Checkout",
                forbidden: false,
                case_sensitive: false,
                translations: [{ lang_id: 640, lang_iso: "fr", translation: "Paiement" }],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/languages")) {
        return new Response(
          JSON.stringify({
            languages: [{ lang_id: 640, lang_iso: "fr", lang_name: "French" }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const matches = await searchLokaliseGlossaryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      secretMaterial: "token",
      glossaries: [
        {
          id: "glossary_local_1",
          name: "Lokalise glossary",
          externalGlossaryId: "proj.123:glossary",
          targetLocale: "fr",
          termCapabilities: { mode: "synced_import", search: true },
        },
      ],
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Checkout",
      limit: 5,
    });

    vi.unstubAllGlobals();

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      glossaryId: "glossary_local_1",
      sourceTerm: "Checkout",
      targetTerm: "Paiement",
      providerKind: "lokalise",
      matchSource: "live_provider",
      externalResourceId: "proj.123:glossary",
      externalTermId: "10",
    });
  });

  it("skips matches when the glossary resource is not attached locally", async () => {
    const fetchMock = vi.fn();
    const matches = await searchLokaliseGlossaryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      secretMaterial: "token",
      glossaries: [
        {
          id: "glossary_local_1",
          name: "Other glossary",
          externalGlossaryId: "other:glossary",
          targetLocale: "fr",
          termCapabilities: { mode: "synced_import", search: true },
        },
      ],
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Checkout",
      limit: 5,
    });

    expect(matches).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the glossary record that matches the requested target locale", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/glossary-terms")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 10,
                term: "Checkout",
                forbidden: false,
                case_sensitive: false,
                translations: [{ lang_id: 640, lang_iso: "fr", translation: "Paiement" }],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/languages")) {
        return new Response(
          JSON.stringify({
            languages: [{ lang_id: 640, lang_iso: "fr", lang_name: "French" }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const matches = await searchLokaliseGlossaryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      secretMaterial: "token",
      glossaries: [
        {
          id: "glossary_fr",
          name: "Lokalise glossary (fr)",
          externalGlossaryId: "proj.123:glossary",
          targetLocale: "fr",
          termCapabilities: { mode: "synced_import", search: true },
        },
        {
          id: "glossary_de",
          name: "Lokalise glossary (de)",
          externalGlossaryId: "proj.123:glossary",
          targetLocale: "de",
          termCapabilities: { mode: "synced_import", search: true },
        },
      ],
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Checkout",
      limit: 5,
    });

    vi.unstubAllGlobals();

    expect(matches).toHaveLength(1);
    expect(matches[0]?.glossaryId).toBe("glossary_fr");
  });
});
