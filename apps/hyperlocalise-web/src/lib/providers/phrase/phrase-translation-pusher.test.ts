import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pushPhraseTranslations } from "./phrase-translation-pusher";

describe("pushPhraseTranslations", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("upserts approved translations with branch and job tag context", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.includes("cloud.memsource.com") && path.includes("/jobs")) {
        const workflowLevel = Number(new URL(path).searchParams.get("workflowLevel") ?? "0");
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

      if (path.includes("api.phrase.com") && path.includes("/keys") && init?.method !== "POST") {
        return new Response(
          JSON.stringify([
            {
              id: "key-1",
              name: "hello",
              description: null,
              tags: ["hyperlocalise:job:phrase-job-1"],
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("api.phrase.com") && path.includes("/keys") && init?.method === "POST") {
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

      if (path.includes("api.phrase.com") && path.includes("/translations")) {
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

    const result = await pushPhraseTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "phrase",
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
        { locale: "fr-FR", key: "hello", externalStringId: "key-1", text: "Bonjour" },
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
        return String(requestUrl).includes("/translations") && requestInit?.method === "POST";
      });

    expect(translationRequests).toHaveLength(2);
    expect(String(translationRequests[0]?.[0])).toContain("branch=main");
    expect(JSON.parse(String(translationRequests[0]?.[1]?.body))).toMatchObject({
      key_id: "key-1",
      locale_name: "fr-FR",
      content: "Bonjour",
      unverified: false,
    });
  });
});
