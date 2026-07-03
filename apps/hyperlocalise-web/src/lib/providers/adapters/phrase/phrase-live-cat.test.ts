import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import {
  buildPhraseLiveCatFile,
  PhraseLiveCatError,
  savePhraseLiveCatComment,
  savePhraseLiveCatTranslation,
} from "./phrase-live-cat";

function createPhraseKeyFile(overrides: Partial<TmsProviderLiveFile> = {}): TmsProviderLiveFile {
  return {
    origin: "provider",
    sourcePath: "keys/home.hero.title",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-06-08T00:00:00Z",
    storedFileId: null,
    metadata: {
      id: "key-1",
      key: "home.hero.title",
      branch: null,
      tags: ["app"],
    },
    filename: "home.hero.title",
    byteSize: null,
    provider: {
      kind: "phrase",
      resourceType: "key",
      externalProjectId: "project-1",
      externalResourceId: "key-1",
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

describe("buildPhraseLiveCatFile", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("loads a single key file with source and target without comments", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      if (
        path.includes("/keys/key-1") &&
        !path.includes("/comments") &&
        !path.includes("/translations")
      ) {
        return new Response(
          JSON.stringify({
            id: "key-1",
            name: "home.hero.title",
            description: "Hero headline",
            plural: false,
            tags: ["app"],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys/key-1/translations")) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-en",
              key_id: "key-1",
              locale_name: "en",
              content: "Hello",
              state: "translated",
              unverified: false,
              excluded: false,
            },
            {
              id: "tr-fr",
              key_id: "key-1",
              locale_name: "fr",
              content: "Bonjour",
              state: "translated",
              unverified: false,
              excluded: false,
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/translations")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (path.includes("/keys/key-1/comments")) {
        return new Response(
          JSON.stringify([
            {
              id: "comment-1",
              message: "Check tone",
              has_replies: false,
              user: { id: "user-1", username: "reviewer", name: "Reviewer" },
              created_at: "2026-06-08T00:01:00Z",
              locales: [{ id: "loc-fr", name: "fr", code: "fr-FR" }],
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await buildPhraseLiveCatFile({
      secretMaterial: "token",
      externalProjectId: "project-1",
      file: createPhraseKeyFile(),
      targetLocale: "fr",
      canEditTranslations: true,
    });

    expect(catFile.segments).toHaveLength(1);
    expect(catFile.segments[0]).toMatchObject({
      externalStringId: "key-1",
      key: "home.hero.title",
      sourceText: "Hello",
      context: "Hero headline",
      target: {
        text: "Bonjour",
        externalTranslationId: "tr-fr",
        isApproved: true,
      },
      comments: [],
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/keys/key-1/comments"),
      expect.anything(),
    );
  });

  it("loads comments from the segment comments endpoint", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      if (
        path.includes("/keys/key-1") &&
        !path.includes("/comments") &&
        !path.includes("/translations")
      ) {
        return new Response(
          JSON.stringify({
            id: "key-1",
            name: "home.hero.title",
            description: "Hero headline",
            plural: false,
            tags: ["app"],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys/key-1/translations")) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-en",
              key_id: "key-1",
              locale_name: "en",
              content: "Hello",
              state: "translated",
              unverified: false,
              excluded: false,
            },
            {
              id: "tr-fr",
              key_id: "key-1",
              locale_name: "fr",
              content: "Bonjour",
              state: "translated",
              unverified: false,
              excluded: false,
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/keys/key-1/comments")) {
        return new Response(
          JSON.stringify([
            {
              id: "comment-1",
              message: "Check tone",
              has_replies: false,
              user: { id: "user-1", username: "reviewer", name: "Reviewer" },
              created_at: "2026-06-08T00:01:00Z",
              locales: [{ id: "loc-fr", name: "fr", code: "fr-FR" }],
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { getPhraseLiveCatSegmentComments } = await import("./phrase-live-cat");
    const comments = await getPhraseLiveCatSegmentComments({
      secretMaterial: "token",
      externalProjectId: "project-1",
      file: createPhraseKeyFile(),
      targetLocale: "fr",
      externalStringId: "key-1",
    });

    expect(comments).toMatchObject([
      { externalCommentId: "comment-1", type: "comment", text: "Check tone" },
    ]);
  });

  it("filters upload-scoped keys by tags and paginates search results", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/keys?")) {
        return new Response(
          JSON.stringify([
            {
              id: "key-hero",
              name: "home.hero.title",
              description: null,
              plural: false,
              tags: ["app"],
            },
            {
              id: "key-footer",
              name: "home.footer.title",
              description: null,
              plural: false,
              tags: ["marketing"],
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/keys/key-hero/translations")) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-en-hero",
              key_id: "key-hero",
              locale_name: "en",
              content: "Hero",
              state: "translated",
              unverified: false,
              excluded: false,
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/keys/key-footer/translations")) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-en-footer",
              key_id: "key-footer",
              locale_name: "en",
              content: "Footer",
              state: "translated",
              unverified: false,
              excluded: false,
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/translations")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (path.includes("/comments")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await buildPhraseLiveCatFile({
      secretMaterial: "token",
      externalProjectId: "project-1",
      file: createPhraseKeyFile({
        sourcePath: "locales/en/home.json",
        filename: "home.json",
        metadata: {
          id: "upload-1",
          name: "home.json",
          branch: null,
          tags: ["app"],
        },
        provider: {
          kind: "phrase",
          resourceType: "file",
          externalProjectId: "project-1",
          externalResourceId: "upload-1",
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
      pagination: {
        offset: 0,
        limit: 10,
        search: "hero",
        queueFilter: "untranslated",
        paginated: true,
      },
    });

    expect(catFile.segments).toHaveLength(1);
    expect(catFile.segments[0]?.key).toBe("home.hero.title");
    expect(catFile.pagination).toMatchObject({
      offset: 0,
      limit: 10,
      returnedCount: 1,
      totalCount: 1,
      hasMore: false,
    });
  });

  it("throws when the requested target locale cannot be matched", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-de", name: "de", code: "de-DE", default: false },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      buildPhraseLiveCatFile({
        secretMaterial: "token",
        externalProjectId: "project-1",
        file: createPhraseKeyFile(),
        targetLocale: "fr-FR",
        canEditTranslations: true,
      }),
    ).rejects.toMatchObject({
      code: "phrase_target_locale_not_found",
    });
  });

  it("leaves comment timestamps null when Phrase omits created and updated times", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      if (
        path.includes("/keys/key-1") &&
        !path.includes("/comments") &&
        !path.includes("/translations")
      ) {
        return new Response(
          JSON.stringify({
            id: "key-1",
            name: "home.hero.title",
            description: null,
            plural: false,
            tags: ["app"],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys/key-1/translations")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (path.includes("/keys/key-1/comments")) {
        return new Response(
          JSON.stringify([
            {
              id: "comment-1",
              message: "Check tone",
              has_replies: false,
              user: { id: "user-1", username: "reviewer", name: "Reviewer" },
              locales: [{ id: "loc-fr", name: "fr", code: "fr-FR" }],
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { getPhraseLiveCatSegmentComments } = await import("./phrase-live-cat");
    const comments = await getPhraseLiveCatSegmentComments({
      secretMaterial: "token",
      externalProjectId: "project-1",
      file: createPhraseKeyFile(),
      targetLocale: "fr",
      externalStringId: "key-1",
    });

    expect(comments[0]?.createdAt).toBeNull();
  });
});

describe("savePhraseLiveCatTranslation", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("upserts a verified translation for the target locale", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/translations") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "tr-fr-new",
            key_id: "key-1",
            locale_name: "fr",
            content: "Bonjour amélioré",
            state: "translated",
            unverified: false,
            excluded: false,
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const translation = await savePhraseLiveCatTranslation({
      secretMaterial: "token",
      externalProjectId: "project-1",
      file: createPhraseKeyFile(),
      targetLocale: "fr",
      externalStringId: "key-1",
      text: "Bonjour amélioré",
    });

    expect(translation).toEqual({
      text: "Bonjour amélioré",
      externalTranslationId: "tr-fr-new",
      isApproved: true,
    });
  });

  it("throws when saving to an unmatched target locale", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-de", name: "de", code: "de-DE", default: false },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      savePhraseLiveCatTranslation({
        secretMaterial: "token",
        externalProjectId: "project-1",
        file: createPhraseKeyFile(),
        targetLocale: "fr-FR",
        externalStringId: "key-1",
        text: "Bonjour",
      }),
    ).rejects.toBeInstanceOf(PhraseLiveCatError);
  });
});

describe("savePhraseLiveCatComment", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("creates a key comment in Phrase with the resolved locale name", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/comments") && init?.method === "POST") {
        const rawBody = init.body;
        const body =
          typeof rawBody === "string"
            ? (JSON.parse(rawBody) as { locale?: { name?: string } })
            : {};
        expect(body.locale?.name).toBe("fr");

        return new Response(
          JSON.stringify({
            id: "comment-new",
            message: "Please review wording",
            has_replies: false,
            user: { id: "user-1", username: "editor", name: "Editor" },
            created_at: "2026-06-08T00:02:00Z",
            locales: [{ id: "loc-fr", name: "fr", code: "fr-FR" }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const comment = await savePhraseLiveCatComment({
      secretMaterial: "token",
      externalProjectId: "project-1",
      file: createPhraseKeyFile(),
      targetLocale: "fr-FR",
      externalStringId: "key-1",
      text: "Please review wording",
    });

    expect(comment).toMatchObject({
      externalCommentId: "comment-new",
      type: "comment",
      text: "Please review wording",
      locale: "fr-FR",
      author: "Editor",
    });
  });

  it("throws when creating a comment for an unmatched target locale", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-de", name: "de", code: "de-DE", default: false },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      savePhraseLiveCatComment({
        secretMaterial: "token",
        externalProjectId: "project-1",
        file: createPhraseKeyFile(),
        targetLocale: "fr-FR",
        externalStringId: "key-1",
        text: "Please review wording",
      }),
    ).rejects.toBeInstanceOf(PhraseLiveCatError);
  });
});
