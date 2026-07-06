import { describe, expect, it, vi } from "vite-plus/test";

import { lokaliseTmsProvider } from "./lokalise-provider";

describe("searchGlossaryMatches context helpers", () => {
  it("returns normalized matches for synced glossaries", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/glossary-terms")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 10,
                term: "Checkout",
                forbidden: false,
                case_sensitive: true,
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

    const matches = await lokaliseTmsProvider.searchGlossaryMatches({
      organizationId: "org_1",
      projectId: "project_1",
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
    } as never);

    vi.unstubAllGlobals();

    expect(matches).toHaveLength(1);
    expect(matches?.[0]).toMatchObject({
      sourceTerm: "Checkout",
      targetTerm: "Paiement",
    });
  });
});

describe("searchTranslationMemoryMatches context helpers", () => {
  it("returns scored key translation pairs for the requested locale", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          keys: [
            {
              key_id: 42,
              key_name: { web: "greeting", ios: "", android: "", other: "" },
              filenames: { web: "", ios: "", android: "", other: "" },
              platforms: [],
              tags: [],
              is_plural: false,
              is_hidden: false,
              is_archived: false,
              translations: [
                {
                  translation_id: 1,
                  key_id: 42,
                  language_iso: "en",
                  translation: "Hello",
                  is_reviewed: true,
                  is_unverified: false,
                },
                {
                  translation_id: 2,
                  key_id: 42,
                  language_iso: "fr",
                  translation: "Bonjour",
                  is_reviewed: true,
                  is_unverified: false,
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const matches = await lokaliseTmsProvider.searchTranslationMemoryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      externalProjectId: "proj.123",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      secretMaterial: "token",
      memory: {
        id: "memory_local_1",
        name: "Lokalise TM",
        externalMemoryId: "proj.123:translation-memory",
        capabilityMode: "synced_import",
      },
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
      limit: 5,
    } as never);

    vi.unstubAllGlobals();

    expect(matches).toHaveLength(1);
    expect(matches?.[0]).toMatchObject({
      sourceText: "Hello",
      targetText: "Bonjour",
    });
  });
});
