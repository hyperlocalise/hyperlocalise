import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchLokaliseFileKeys } from "./lokalise-file-fetcher";

describe("fetchLokaliseFileKeys", () => {
  let originalFetch: typeof fetch;

  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "lokalise" as const,
    displayName: "Lokalise",
    region: null,
    baseUrl: null,
    validationStatus: "connected",
    validationMessage: null,
    lastValidatedAt: null,
    encryptionAlgorithm: "aes-256-gcm",
    keyVersion: 1,
    ciphertext: "cipher",
    iv: "iv",
    authTag: "tag",
    maskedSecretSuffix: "cret",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const project = {
    sourceLocale: "en",
    targetLocales: ["fr", "de"],
    providerMetadata: {
      baseLanguageId: 640,
    },
  } as never;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized file and key metadata with platform filenames and readiness", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/projects/proj.123/languages")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            languages: [
              { lang_id: 640, lang_iso: "en", lang_name: "English", is_rtl: false },
              { lang_id: 673, lang_iso: "fr", lang_name: "French", is_rtl: false },
              { lang_id: 674, lang_iso: "de", lang_name: "German", is_rtl: false },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/proj.123/keys")) {
        const headers = new Headers({ "Content-Type": "application/json" });
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            keys: [
              {
                key_id: 4242,
                key_name: {
                  web: "home.hero.title",
                  ios: "",
                  android: "",
                  other: "",
                },
                filenames: {
                  web: "locales/en/home.json",
                  ios: "",
                  android: "",
                  other: "",
                },
                description: "Hero headline",
                context: "home",
                platforms: ["web"],
                tags: ["app", "marketing"],
                is_plural: false,
                is_hidden: false,
                is_archived: false,
                modified_at: "2026-05-02T00:00:00Z",
                translations_modified_at: "2026-05-03T00:00:00Z",
                translations: [
                  {
                    translation_id: 1,
                    key_id: 4242,
                    language_iso: "fr",
                    translation: "Bonjour",
                    is_reviewed: true,
                    is_unverified: false,
                  },
                  {
                    translation_id: 2,
                    key_id: 4242,
                    language_iso: "de",
                    translation: "",
                    is_reviewed: false,
                    is_unverified: false,
                  },
                ],
              },
              {
                key_id: 4243,
                key_name: {
                  web: "home.hero.subtitle",
                  ios: "",
                  android: "",
                  other: "",
                },
                filenames: {
                  web: "locales/en/home.json",
                  ios: "",
                  android: "",
                  other: "",
                },
                description: "Hero subtitle",
                context: "home",
                platforms: ["web"],
                tags: ["app"],
                is_plural: false,
                is_hidden: true,
                is_archived: false,
                modified_at: "2026-05-02T00:00:00Z",
                translations_modified_at: "2026-05-03T00:00:00Z",
                translations: [
                  {
                    translation_id: 3,
                    key_id: 4243,
                    language_iso: "fr",
                    translation: "Sous-titre",
                    is_reviewed: false,
                    is_unverified: true,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchLokaliseFileKeys({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      credential,
      project,
      secretMaterial: "lokalise-secret",
    });

    const key = result.find(
      (item) => item.resourceType === "key" && item.externalResourceId === "4242",
    );
    expect(key).toMatchObject({
      sourcePath: "files/locales/en/home.json/keys/home.hero.title",
      displayName: "home.hero.title",
      format: "json",
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
      localeReadiness: {
        fr: "ready",
        de: "missing",
      },
      providerPayload: {
        id: 4242,
        key: "home.hero.title",
        platforms: ["web"],
        filenames: {
          web: "locales/en/home.json",
        },
        tags: ["app", "marketing"],
      },
    });

    const file = result.find(
      (item) =>
        item.resourceType === "file" && item.externalResourceId === "web::locales/en/home.json",
    );
    expect(file).toMatchObject({
      sourcePath: "locales/en/web/locales/en/home.json",
      displayName: "locales/en/home.json",
      format: "json",
      localeReadiness: {
        fr: "ready",
        de: "missing",
      },
      providerPayload: expect.objectContaining({
        platform: "web",
        filename: "locales/en/home.json",
        tags: expect.arrayContaining(["app", "marketing"]),
        bundleDownload: expect.objectContaining({
          bundleStructure: "%LANG_ISO%.%FORMAT%",
          format: "json",
          filterLangs: ["fr", "de"],
        }),
      }),
    });

    const keyFetches = vi
      .mocked(fetchMock)
      .mock.calls.filter((call) => String(call[0]).includes("/keys?"));
    expect(keyFetches.length).toBeGreaterThan(0);
    expect(String(keyFetches[0]?.[0])).toContain("include_translations=1");
    expect(String(keyFetches[0]?.[0])).toContain("pagination=cursor");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/projects/proj.123/keys?"),
      expect.objectContaining({
        headers: { "X-Api-Token": "lokalise-secret" },
      }),
    );
  });

  it("throws lokalise_auth_invalid for unauthorized responses", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
        status: 401,
      });
    }) as unknown as typeof fetch;

    await expect(
      fetchLokaliseFileKeys({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "lokalise",
        externalProjectId: "proj.123",
        credential,
        project,
        secretMaterial: "lokalise-secret",
      }),
    ).rejects.toThrow("lokalise_auth_invalid");
  });
});
