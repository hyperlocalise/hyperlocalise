import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { phraseTmsProvider } from "./phrase-provider";

describe("phraseTmsProvider.pullTaskContent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("pulls scoped keys and translations for a Phrase TMS job", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const requestUrl = new URL(String(url));

      if (requestUrl.hostname === "cloud.memsource.com" && requestUrl.pathname.includes("/jobs")) {
        const workflowLevel = Number(requestUrl.searchParams.get("workflowLevel") ?? "0");
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

      if (requestUrl.hostname === "api.phrase.com" && requestUrl.pathname.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      if (
        requestUrl.hostname === "api.phrase.com" &&
        requestUrl.pathname.includes("/keys") &&
        init?.method !== "POST"
      ) {
        return new Response(
          JSON.stringify([
            {
              id: "key-1",
              name: "hello",
              description: "Greeting",
              tags: ["hyperlocalise:job:phrase-job-1"],
            },
            {
              id: "key-2",
              name: "world",
              description: null,
              tags: ["other"],
            },
          ]),
          { status: 200 },
        );
      }

      if (
        requestUrl.pathname.includes("/translations") &&
        requestUrl.searchParams.get("locale_name") === "en"
      ) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-en-1",
              key_id: "key-1",
              locale_name: "en",
              content: "Hello",
              state: "translated",
              unverified: false,
            },
          ]),
          { status: 200 },
        );
      }

      if (
        requestUrl.pathname.includes("/translations") &&
        requestUrl.searchParams.get("locale_name") === "fr"
      ) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-fr-1",
              key_id: "key-1",
              locale_name: "fr",
              content: "Bonjour",
              state: "translated",
              unverified: false,
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await phraseTmsProvider.pullTaskContent({
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
    });

    expect(result).toMatchObject({
      externalJobId: "phrase-job-1-task-fr-fr",
      externalTaskId: "task-fr",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      providerPayload: {
        branch: "main",
        jobTag: "hyperlocalise:job:phrase-job-1",
      },
    });
    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({
      externalStringId: "key-1",
      key: "hello",
      sourceText: "Hello",
      translations: [
        {
          locale: "fr-FR",
          text: "Bonjour",
          externalTranslationId: "tr-fr-1",
          isApproved: true,
        },
      ],
    });
  });

  it("throws when the job target locale cannot be resolved", async () => {
    const fetchMock = vi.fn(async (url) => {
      const requestUrl = new URL(String(url));

      if (requestUrl.hostname === "api.phrase.com" && requestUrl.pathname.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-de", name: "de", code: "de-DE", default: false },
            { id: "loc-es", name: "es", code: "es-ES", default: false },
          ]),
          { status: 200 },
        );
      }

      if (requestUrl.hostname === "api.phrase.com" && requestUrl.pathname.includes("/keys")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    await expect(
      phraseTmsProvider.pullTaskContent({
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
          },
        } as never,
        secretMaterial: "token",
      }),
    ).rejects.toThrow("phrase_task_missing_target_language");
  });
});
