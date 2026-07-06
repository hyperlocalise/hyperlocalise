import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import {
  buildLokaliseLiveCatFile,
  getLokaliseLiveCatSegmentTarget,
  LokaliseLiveCatError,
  saveLokaliseLiveCatTranslation,
} from "./lokalise-live-cat";

function createLokaliseKeyFile(overrides: Partial<TmsProviderLiveFile> = {}): TmsProviderLiveFile {
  return {
    origin: "provider",
    sourcePath: "keys/home.hero.title",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-06-08T00:00:00Z",
    storedFileId: null,
    metadata: {
      id: 101,
      key: "home.hero.title",
      tags: ["app"],
    },
    filename: "home.hero.title",
    byteSize: null,
    provider: {
      kind: "lokalise",
      resourceType: "key",
      externalProjectId: "proj.123",
      externalResourceId: "101",
      externalUrl: null,
      syncState: "synced",
      sourceLocale: "en",
      targetLocales: ["fr"],
      localeReadiness: {},
      revision: null,
      format: "json",
      lastSyncedAt: null,
    },
    latestJob: null,
    ...overrides,
  };
}

describe("buildLokaliseLiveCatFile", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("loads a single key file without embedding targets in the queue", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/languages")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            languages: [
              { lang_id: 640, lang_iso: "en", lang_name: "English", is_rtl: false },
              { lang_id: 641, lang_iso: "fr", lang_name: "French", is_rtl: false },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys") && path.includes("filter_key_ids=101")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            keys: [
              {
                key_id: 101,
                key_name: { web: "home.hero.title", ios: "", android: "", other: "" },
                filenames: { web: "", ios: "", android: "", other: "" },
                description: "Hero title",
                tags: ["app"],
                translations: [
                  {
                    translation_id: 1,
                    key_id: 101,
                    language_iso: "en",
                    translation: "Welcome",
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

      return new Response("not found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await buildLokaliseLiveCatFile({
      secretMaterial: "token",
      baseUrl: "https://api.lokalise.test/api2",
      externalProjectId: "proj.123",
      file: createLokaliseKeyFile(),
      targetLocale: "fr",
      canEditTranslations: true,
      pagination: { offset: 0, limit: 50, queueFilter: "all", paginated: true },
    });

    expect(catFile.segments).toEqual([
      {
        externalStringId: "101",
        key: "home.hero.title",
        sourceText: "Welcome",
        context: "Hero title",
        type: null,
      },
    ]);
    expect(catFile.segments[0]).not.toHaveProperty("target");
  });

  it("rejects unsupported queue filters", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/languages")) {
        return new Response(
          JSON.stringify({
            languages: [{ lang_id: 641, lang_iso: "fr", lang_name: "French", is_rtl: false }],
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      buildLokaliseLiveCatFile({
        secretMaterial: "token",
        baseUrl: "https://api.lokalise.test/api2",
        externalProjectId: "proj.123",
        file: createLokaliseKeyFile(),
        targetLocale: "fr",
        canEditTranslations: true,
        pagination: { offset: 0, limit: 50, queueFilter: "has_issues", paginated: true },
      }),
    ).rejects.toBeInstanceOf(LokaliseLiveCatError);
  });

  it("paginates unscoped file queues beyond the first 100 keys", async () => {
    const firstPageKeys = Array.from({ length: 100 }, (_, index) => ({
      key_id: index + 1,
      key_name: { web: `key.${index + 1}`, ios: "", android: "", other: "" },
      filenames: { web: "", ios: "", android: "", other: "" },
      description: null,
      tags: [],
      translations: [
        {
          translation_id: index + 1,
          key_id: index + 1,
          language_iso: "en",
          translation: `Source ${index + 1}`,
          is_reviewed: true,
          is_unverified: false,
        },
      ],
    }));
    const secondPageKeys = [
      {
        key_id: 101,
        key_name: { web: "key.101", ios: "", android: "", other: "" },
        filenames: { web: "", ios: "", android: "", other: "" },
        description: null,
        tags: [],
        translations: [
          {
            translation_id: 101,
            key_id: 101,
            language_iso: "en",
            translation: "Source 101",
            is_reviewed: true,
            is_unverified: false,
          },
        ],
      },
    ];

    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/languages")) {
        return new Response(
          JSON.stringify({
            languages: [
              { lang_id: 640, lang_iso: "en", lang_name: "English", is_rtl: false },
              { lang_id: 641, lang_iso: "fr", lang_name: "French", is_rtl: false },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys")) {
        const cursor = new URL(path, "https://api.lokalise.test").searchParams.get("cursor");
        return new Response(JSON.stringify({ keys: cursor ? secondPageKeys : firstPageKeys }), {
          status: 200,
          headers: cursor ? {} : { "X-Pagination-Next-Cursor": "page-2" },
        });
      }

      return new Response("not found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await buildLokaliseLiveCatFile({
      secretMaterial: "token",
      baseUrl: "https://api.lokalise.test/api2",
      externalProjectId: "proj.123",
      file: createLokaliseKeyFile({
        sourcePath: "files/app.json",
        filename: "app.json",
        metadata: { tags: [] },
        provider: {
          kind: "lokalise",
          resourceType: "file",
          externalProjectId: "proj.123",
          externalResourceId: "file:app.json",
          externalUrl: null,
          syncState: "synced",
          sourceLocale: "en",
          targetLocales: ["fr"],
          localeReadiness: {},
          revision: null,
          format: "json",
          lastSyncedAt: null,
        },
      }),
      targetLocale: "fr",
      canEditTranslations: true,
      pagination: { offset: 100, limit: 1, queueFilter: "all", paginated: true },
    });

    expect(catFile.segments).toEqual([
      expect.objectContaining({
        externalStringId: "101",
        key: "key.101",
        sourceText: "Source 101",
      }),
    ]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/keys"))).toHaveLength(2);
  });
});

describe("getLokaliseLiveCatSegmentTarget", () => {
  it("maps reviewed translations to approved targets", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/languages")) {
        return new Response(
          JSON.stringify({
            languages: [{ lang_id: 641, lang_iso: "fr", lang_name: "French", is_rtl: false }],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys")) {
        return new Response(
          JSON.stringify({
            keys: [
              {
                key_id: 101,
                key_name: { web: "home.hero.title", ios: "", android: "", other: "" },
                filenames: { web: "", ios: "", android: "", other: "" },
                translations: [
                  {
                    translation_id: 2,
                    key_id: 101,
                    language_iso: "fr",
                    translation: "Bienvenue",
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

      return new Response("not found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const target = await getLokaliseLiveCatSegmentTarget({
      secretMaterial: "token",
      baseUrl: "https://api.lokalise.test/api2",
      externalProjectId: "proj.123",
      file: createLokaliseKeyFile(),
      targetLocale: "fr",
      externalStringId: "101",
    });

    expect(target).toEqual({
      text: "Bienvenue",
      externalTranslationId: "2",
      isApproved: true,
    });
  });
});

describe("saveLokaliseLiveCatTranslation", () => {
  it("writes reviewed translations back to Lokalise", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);

      if (path.includes("/languages")) {
        return new Response(
          JSON.stringify({
            languages: [{ lang_id: 641, lang_iso: "fr", lang_name: "French", is_rtl: false }],
          }),
          { status: 200 },
        );
      }

      if (init?.method === "PUT" && path.includes("/keys")) {
        return new Response(JSON.stringify({ keys: [], errors: [] }), { status: 200 });
      }

      if (path.includes("/keys")) {
        return new Response(
          JSON.stringify({
            keys: [
              {
                key_id: 101,
                key_name: { web: "home.hero.title", ios: "", android: "", other: "" },
                filenames: { web: "", ios: "", android: "", other: "" },
                translations: [
                  {
                    translation_id: 2,
                    key_id: 101,
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

      return new Response("not found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await saveLokaliseLiveCatTranslation({
      secretMaterial: "token",
      baseUrl: "https://api.lokalise.test/api2",
      externalProjectId: "proj.123",
      file: createLokaliseKeyFile(),
      targetLocale: "fr",
      externalStringId: "101",
      text: "Bonjour",
    });

    expect(saved).toEqual({
      text: "Bonjour",
      externalTranslationId: "2",
      isApproved: true,
    });
  });
});
