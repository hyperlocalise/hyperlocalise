import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { requestUrlString } from "../../fetch-mock-helpers";
import { pullLokaliseTaskContent } from "./lokalise-content-puller";

describe("pullLokaliseTaskContent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("pulls task-scoped keys and translations through the provider-neutral shape", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = requestUrlString(url);

      if (path.endsWith("/tasks/42")) {
        return new Response(
          JSON.stringify({
            task: {
              task_id: 42,
              title: "Homepage",
              status: "in_progress",
              task_type: "translation",
              source_language_iso: "en",
              languages: [
                {
                  language_iso: "fr",
                  language_id: 673,
                  language_name: "French",
                  keys: [4242],
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys?") && init?.method !== "PUT") {
        return new Response(
          JSON.stringify({
            keys: [
              {
                key_id: 4242,
                key_name: { web: "hello", ios: "", android: "", other: "" },
                filenames: { web: "locales/en/home.json", ios: "", android: "", other: "" },
                platforms: ["web"],
                translations: [
                  {
                    translation_id: 1,
                    key_id: 4242,
                    language_iso: "en",
                    translation: "Hello",
                    is_reviewed: true,
                    is_unverified: false,
                  },
                  {
                    translation_id: 2,
                    key_id: 4242,
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
      }

      if (path.endsWith("/files/download") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            bundle_url: "https://downloads.lokalise.test/bundle.zip",
          }),
          { status: 200 },
        );
      }

      if (path === "https://downloads.lokalise.test/bundle.zip") {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const content = await pullLokaliseTaskContent({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      externalJobId: "42",
      credential: {
        id: "cred-1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      project: {
        sourceLocale: "en",
        targetLocales: ["fr"],
        providerMetadata: {},
      } as never,
      secretMaterial: "token",
    });

    expect(content).toMatchObject({
      externalJobId: "42",
      externalTaskId: "42",
      sourceLocale: "en",
      targetLocales: ["fr"],
      units: [
        {
          externalStringId: "4242",
          key: "hello",
          sourceText: "Hello",
          translations: [
            {
              locale: "fr",
              text: "Bonjour",
              externalTranslationId: "2",
              isApproved: true,
            },
          ],
        },
      ],
      exportArtifact: {
        url: "https://downloads.lokalise.test/bundle.zip",
        format: "json",
        byteLength: 3,
      },
    });
    const keyListRequest = vi
      .mocked(fetchMock)
      .mock.calls.map(([requestUrl]) => requestUrlString(requestUrl))
      .find((requestUrl) => requestUrl.includes("/keys?"));
    expect(keyListRequest).toContain("filter_key_ids=4242");
  });
});
