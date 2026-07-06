import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { requestBodyString, requestUrlString } from "@/lib/providers/shared/fetch-mock-helpers";
import {
  buildPhraseTranslationWriteBackGroups,
  normalizePhraseMatchScore,
  normalizePhraseTranslationMemorySearchMatches,
  phraseTmsProvider,
} from "./phrase-provider";

describe("phraseTmsProvider.pushTranslations", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("upserts approved translations with branch and job tag context", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const parsedUrl = new URL(String(url));
      const host = parsedUrl.hostname;
      const pathname = parsedUrl.pathname;

      if (host === "cloud.memsource.com" && pathname.includes("/jobs")) {
        const workflowLevel = Number(parsedUrl.searchParams.get("workflowLevel") ?? "0");
        if (workflowLevel === 1) {
          return new Response(
            JSON.stringify({
              content: [
                {
                  uid: "task-fr",
                  innerId: "phrase-job-1",
                  status: "NEW",
                  targetLang: "fr-FR",
                  filename: "Homepage French",
                },
              ],
              totalPages: 1,
            }),
            { status: 200 },
          );
        }

        return new Response(JSON.stringify({ content: [], totalPages: 0 }), { status: 200 });
      }

      if (host === "api.phrase.com" && pathname.includes("/keys") && init?.method !== "POST") {
        return new Response(
          JSON.stringify([
            {
              id: "key-1",
              name: "hello",
              description: "Greeting",
              tags: ["hyperlocalise:job:phrase-job-1"],
            },
          ]),
          { status: 200 },
        );
      }

      if (host === "api.phrase.com" && pathname.includes("/keys") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "key-2",
            name: "world",
            description: null,
            tags: ["hyperlocalise:job:phrase-job-1"],
          }),
          { status: 201 },
        );
      }

      if (host === "api.phrase.com" && pathname.includes("/translations")) {
        return new Response(
          JSON.stringify({
            id: "tr-fr-2",
            key_id: "key-2",
            locale_name: "fr-FR",
            content: "Monde",
            state: "translated",
            unverified: false,
          }),
          { status: 201 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await phraseTmsProvider.pushTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      externalProjectId: "strings-project-1",
      externalJobId: "phrase-job-1-task-fr-fr",
      credential: {
        id: "cred_1",
        region: null,
        baseUrl: "https://cloud.memsource.com/web",
      } as never,
      project: {
        providerMetadata: {
          tmsProjectUid: "tms-project-1",
          defaultBranch: "main",
        },
      } as never,
      secretMaterial: "token",
      translations: [
        { locale: "fr-FR", key: "hello", text: "Bonjour" },
        { locale: "fr-FR", key: "world", text: "Monde" },
      ],
    });

    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.asyncOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "phrase_upsert_translation",
          keyId: "key-1",
          locale: "fr-FR",
          branch: "main",
          jobTag: "hyperlocalise:job:phrase-job-1",
          status: "succeeded",
        }),
        expect.objectContaining({
          type: "phrase_upsert_translation",
          keyId: "key-2",
          locale: "fr-FR",
          branch: "main",
          status: "succeeded",
        }),
      ]),
    );

    const translationRequests = vi
      .mocked(fetchMock)
      .mock.calls.filter(([requestUrl, requestInit]) => {
        return (
          requestUrlString(requestUrl).includes("/translations") && requestInit?.method === "POST"
        );
      });

    expect(translationRequests).toHaveLength(2);
    expect(requestUrlString(translationRequests[0]![0])).toContain("branch=main");
    expect(JSON.parse(requestBodyString(translationRequests[0]?.[1]?.body))).toMatchObject({
      key_id: "key-1",
      locale_name: "fr-FR",
      content: "Bonjour",
      unverified: false,
    });

    const createKeyRequests = vi
      .mocked(fetchMock)
      .mock.calls.filter(([requestUrl, requestInit]) => {
        return requestUrlString(requestUrl).includes("/keys") && requestInit?.method === "POST";
      });
    expect(createKeyRequests).toHaveLength(1);
    expect(JSON.parse(requestBodyString(createKeyRequests[0]?.[1]?.body))).toMatchObject({
      name: "world",
    });
  });

  it("skips TMS lookups when tmsProjectUid is absent from metadata", async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsedUrl = new URL(String(url));

      if (parsedUrl.hostname === "cloud.memsource.com") {
        throw new Error("TMS API should not be called for Strings-only projects");
      }

      if (parsedUrl.hostname === "api.phrase.com" && parsedUrl.pathname.includes("/keys")) {
        return new Response(
          JSON.stringify([
            {
              id: "key-1",
              name: "hello",
              description: null,
              tags: [],
            },
          ]),
          { status: 200 },
        );
      }

      if (parsedUrl.hostname === "api.phrase.com" && parsedUrl.pathname.includes("/translations")) {
        return new Response(
          JSON.stringify({
            id: "tr-fr-1",
            key_id: "key-1",
            locale_name: "fr-FR",
            content: "Bonjour",
            state: "translated",
            unverified: false,
          }),
          { status: 201 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await phraseTmsProvider.pushTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      externalProjectId: "strings-project-1",
      externalJobId: "phrase-job-1-task-fr-fr",
      credential: {
        id: "cred_1",
        region: null,
        baseUrl: "https://cloud.memsource.com/web",
      } as never,
      project: {
        providerMetadata: {
          stringsProjectId: "strings-project-1",
          defaultBranch: "main",
        },
      } as never,
      secretMaterial: "token",
      translations: [{ locale: "fr-FR", key: "hello", text: "Bonjour" }],
    });

    expect(result.uploaded).toBe(1);
    expect(
      vi
        .mocked(fetchMock)
        .mock.calls.some(
          ([requestUrl]) =>
            new URL(requestUrlString(requestUrl)).hostname === "cloud.memsource.com",
        ),
    ).toBe(false);
  });

  it("rejects stale externalStringId values that no longer match the key name", async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsedUrl = new URL(String(url));

      if (parsedUrl.hostname === "api.phrase.com" && parsedUrl.pathname.includes("/keys")) {
        return new Response(
          JSON.stringify([
            {
              id: "key-hello",
              name: "hello",
              description: null,
              tags: [],
            },
          ]),
          { status: 200 },
        );
      }

      if (parsedUrl.hostname === "api.phrase.com" && parsedUrl.pathname.includes("/translations")) {
        throw new Error("translation API should not be called for mismatched key ids");
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await phraseTmsProvider.pushTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      externalProjectId: "strings-project-1",
      externalJobId: "phrase-job-1-task-fr-fr",
      credential: {
        id: "cred_1",
        region: null,
        baseUrl: null,
      } as never,
      project: {
        providerMetadata: {
          stringsProjectId: "strings-project-1",
        },
      } as never,
      secretMaterial: "token",
      translations: [
        {
          locale: "fr-FR",
          key: "hello",
          externalStringId: "stale-key-id",
          text: "Bonjour",
        },
      ],
    });

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      {
        locale: "fr-FR",
        fileId: null,
        message: "phrase_translation_key_id_mismatch",
      },
    ]);
  });
});
describe("buildPhraseTranslationWriteBackGroups", () => {
  it("groups translations by locale and preserves branch and job tag context", () => {
    const result = buildPhraseTranslationWriteBackGroups({
      branch: "main",
      jobTag: "hyperlocalise:job:phrase-job-1",
      defaultTargetLocale: "fr-FR",
      translations: [
        { locale: "fr-FR", key: "hello", text: "Bonjour" },
        { locale: "fr-FR", externalStringId: "key-2", text: "Monde" },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.groups).toEqual([
      {
        locale: "fr-FR",
        branch: "main",
        jobTag: "hyperlocalise:job:phrase-job-1",
        entries: [
          {
            key: "hello",
            keyId: null,
            locale: "fr-FR",
            text: "Bonjour",
            branch: "main",
            jobTag: "hyperlocalise:job:phrase-job-1",
          },
          {
            key: "key-2",
            keyId: "key-2",
            locale: "fr-FR",
            text: "Monde",
            branch: "main",
            jobTag: "hyperlocalise:job:phrase-job-1",
          },
        ],
      },
    ]);
  });

  it("records validation failures for incomplete uploads", () => {
    const result = buildPhraseTranslationWriteBackGroups({
      branch: null,
      jobTag: null,
      defaultTargetLocale: null,
      translations: [
        { locale: "", key: "hello", text: "Bonjour" },
        { locale: "fr-FR", key: "", text: "Monde" },
        { locale: "fr-FR", key: "world", text: "   " },
      ],
    });

    expect(result.groups).toEqual([]);
    expect(result.failures).toEqual([
      { locale: "", fileId: null, message: "phrase_translation_missing_locale" },
      { locale: "fr-FR", fileId: null, message: "phrase_translation_missing_key" },
      { locale: "fr-FR", fileId: null, message: "phrase_translation_missing_text" },
    ]);
  });
});
describe("normalizePhraseMatchScore", () => {
  it("converts fractional Phrase scores to 0-100", () => {
    expect(normalizePhraseMatchScore(0.85)).toBe(85);
    expect(normalizePhraseMatchScore(0)).toBe(0);
    expect(normalizePhraseMatchScore(1)).toBe(100);
  });

  it("clamps already-percent scores", () => {
    expect(normalizePhraseMatchScore(92)).toBe(92);
    expect(normalizePhraseMatchScore(150)).toBe(100);
    expect(normalizePhraseMatchScore(-5)).toBe(0);
  });

  it("returns null for missing or non-finite scores", () => {
    expect(normalizePhraseMatchScore(null)).toBeNull();
    expect(normalizePhraseMatchScore(undefined)).toBeNull();
    expect(normalizePhraseMatchScore(Number.NaN)).toBeNull();
  });
});

describe("normalizePhraseTranslationMemorySearchMatches", () => {
  const memoryIdByExternalUid = new Map([["tm-uid-1", "memory_local_1"]]);

  it("maps attached memories into agent context matches", () => {
    const matches = normalizePhraseTranslationMemorySearchMatches(
      [
        {
          transMemoryUid: "tm-uid-1",
          transMemoryName: "Product TM",
          segmentId: "seg-1",
          sourceText: "Hello",
          targetText: "Bonjour",
          targetLocale: "fr-FR",
          score: 0.91,
        },
      ],
      { targetLocale: "fr-FR", memoryIdByExternalUid },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      memoryId: "memory_local_1",
      memoryName: "Product TM",
      sourceText: "Hello",
      targetText: "Bonjour",
      matchScore: 91,
      matchSource: "live_provider",
      providerKind: "phrase",
      externalResourceId: "tm-uid-1",
    });
  });

  it("skips matches for memories that are not synced locally", () => {
    const matches = normalizePhraseTranslationMemorySearchMatches(
      [
        {
          transMemoryUid: "unknown-tm",
          transMemoryName: null,
          segmentId: null,
          sourceText: "Hello",
          targetText: "Bonjour",
          targetLocale: "fr-FR",
          score: 0.8,
        },
      ],
      { targetLocale: "fr-FR", memoryIdByExternalUid },
    );

    expect(matches).toEqual([]);
  });

  it("filters by target locale when provided on the match", () => {
    const matches = normalizePhraseTranslationMemorySearchMatches(
      [
        {
          transMemoryUid: "tm-uid-1",
          transMemoryName: null,
          segmentId: null,
          sourceText: "Hello",
          targetText: "Hola",
          targetLocale: "es-ES",
          score: 0.8,
        },
      ],
      { targetLocale: "fr-FR", memoryIdByExternalUid },
    );

    expect(matches).toEqual([]);
  });
});
