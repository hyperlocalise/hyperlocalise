import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import {
  buildLokaliseLiveCatFile,
  LokaliseLiveCatError,
  saveLokaliseLiveCatComment,
  saveLokaliseLiveCatTranslation,
} from "./lokalise-live-cat";

function createLokaliseKeyFile(overrides: Partial<TmsProviderLiveFile> = {}): TmsProviderLiveFile {
  return {
    origin: "provider",
    sourcePath: "files/en/web/home.json/keys/home.hero.title",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-06-08T00:00:00Z",
    storedFileId: null,
    metadata: {
      id: 42,
      key: "home.hero.title",
      context: "Hero headline",
    },
    filename: "home.hero.title",
    byteSize: null,
    provider: {
      kind: "lokalise",
      resourceType: "key",
      externalProjectId: "123.abc",
      externalResourceId: "42",
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

  it("loads a single key file with source, target, and comments", async () => {
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

      if (path.includes("/keys?") && path.includes("filter_key_ids=42")) {
        return new Response(
          JSON.stringify({
            keys: [
              {
                key_id: 42,
                key_name: { web: "home.hero.title", ios: "", android: "", other: "" },
                filenames: { web: "home.json", ios: "", android: "", other: "" },
                description: "Hero headline",
                context: "Hero headline",
                platforms: ["web"],
                tags: [],
                is_plural: false,
                is_hidden: false,
                is_archived: false,
                created_at: "2026-06-08T00:00:00Z",
                modified_at: "2026-06-08T00:00:00Z",
                translations_modified_at: "2026-06-08T00:00:00Z",
                translations: [
                  {
                    translation_id: 1,
                    key_id: 42,
                    language_iso: "en",
                    translation: "Hello",
                    modified_at: "2026-06-08T00:00:00Z",
                    modified_at_timestamp: 1,
                    is_reviewed: true,
                    is_unverified: false,
                  },
                  {
                    translation_id: 2,
                    key_id: 42,
                    language_iso: "fr",
                    translation: "Bonjour",
                    modified_at: "2026-06-08T00:00:00Z",
                    modified_at_timestamp: 1,
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

      if (path.includes("/keys/42/comments")) {
        return new Response(
          JSON.stringify({
            comments: [
              {
                comment_id: 9,
                key_id: 42,
                comment: "Check tone",
                added_by: 1,
                added_by_email: "reviewer@example.com",
                added_at: "2026-06-08T00:01:00Z",
                added_at_timestamp: 1,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await buildLokaliseLiveCatFile({
      secretMaterial: "token",
      externalProjectId: "123.abc",
      file: createLokaliseKeyFile(),
      targetLocale: "fr",
      canEditTranslations: true,
    });

    expect(catFile.segments).toHaveLength(1);
    expect(catFile.segments[0]).toMatchObject({
      externalStringId: "42",
      key: "home.hero.title",
      sourceText: "Hello",
      context: "Hero headline",
      target: {
        text: "Bonjour",
        externalTranslationId: "2",
        isApproved: true,
      },
      comments: [{ externalCommentId: "9", type: "comment", text: "Check tone" }],
    });
    expect(catFile.queueSummary).toMatchObject({
      total: 1,
      reviewed: 1,
      hasIssues: 1,
    });
  });

  it("scopes file resources to provider key ids", async () => {
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

      if (path.includes("/keys?") && path.includes("filter_key_ids=42")) {
        return new Response(
          JSON.stringify({
            keys: [
              {
                key_id: 42,
                key_name: { web: "home.hero.title", ios: "", android: "", other: "" },
                filenames: { web: "home.json", ios: "", android: "", other: "" },
                description: null,
                context: null,
                platforms: ["web"],
                tags: [],
                is_plural: false,
                is_hidden: false,
                is_archived: false,
                created_at: "2026-06-08T00:00:00Z",
                modified_at: "2026-06-08T00:00:00Z",
                translations_modified_at: "2026-06-08T00:00:00Z",
                translations: [
                  {
                    translation_id: 2,
                    key_id: 42,
                    language_iso: "fr",
                    translation: "Bonjour",
                    modified_at: "2026-06-08T00:00:00Z",
                    modified_at_timestamp: 1,
                    is_reviewed: false,
                    is_unverified: true,
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/comments")) {
        return new Response(JSON.stringify({ comments: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await buildLokaliseLiveCatFile({
      secretMaterial: "token",
      externalProjectId: "123.abc",
      file: createLokaliseKeyFile({
        sourcePath: "locales/en/web/home.json",
        filename: "home.json",
        metadata: {
          platform: "web",
          filename: "home.json",
          keyIds: [42],
        },
        provider: {
          kind: "lokalise",
          resourceType: "file",
          externalProjectId: "123.abc",
          externalResourceId: "web::home.json",
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
    });

    expect(catFile.segments).toHaveLength(1);
    expect(catFile.queueSummary).toMatchObject({
      total: 1,
      needsReview: 1,
    });
  });
});

describe("saveLokaliseLiveCatTranslation", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("writes reviewed translations through bulk update", async () => {
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

      if (path.endsWith("/keys") && init?.method === "PUT") {
        return new Response(JSON.stringify({ keys: [{ key_id: 42 }], errors: [] }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await saveLokaliseLiveCatTranslation({
      secretMaterial: "token",
      externalProjectId: "123.abc",
      targetLocale: "fr",
      externalStringId: "42",
      text: "Salut",
    });

    expect(saved).toMatchObject({
      text: "Salut",
      isApproved: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/projects/123.abc/keys"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("maps auth failures to lokalise_auth_invalid", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("Unauthorized", { status: 401 }),
    ) as typeof fetch;

    await expect(
      saveLokaliseLiveCatTranslation({
        secretMaterial: "token",
        externalProjectId: "123.abc",
        targetLocale: "fr",
        externalStringId: "42",
        text: "Salut",
      }),
    ).rejects.toBeInstanceOf(LokaliseLiveCatError);
  });
});

describe("saveLokaliseLiveCatComment", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("creates a key comment", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            comments: [
              {
                comment_id: 11,
                key_id: 42,
                comment: "Needs review",
                added_by: 1,
                added_by_email: "reviewer@example.com",
                added_at: "2026-06-08T00:02:00Z",
                added_at_timestamp: 1,
              },
            ],
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const comment = await saveLokaliseLiveCatComment({
      secretMaterial: "token",
      externalProjectId: "123.abc",
      targetLocale: "fr",
      externalStringId: "42",
      text: "Needs review",
    });

    expect(comment).toMatchObject({
      externalCommentId: "11",
      type: "comment",
      text: "Needs review",
      author: "reviewer@example.com",
    });
  });
});
