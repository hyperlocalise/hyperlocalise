import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildPhraseKeyExternalResourceId,
  buildPhraseKeySourcePath,
  buildPhraseUploadSourcePath,
  mapPhraseTranslationReadiness,
  parsePhraseExternalResourceId,
  phraseTmsProvider,
} from "./phrase-provider";

describe("phraseTmsProvider.fetchFileKeys", () => {
  let originalFetch: typeof fetch;

  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "phrase" as const,
    displayName: "Phrase",
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
    providerMetadata: {
      slug: "marketing-website",
      mainFormat: "json",
      accountSlug: "acme",
    },
  } as never;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized upload and key metadata with branch and tag filters", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/branches")) {
        return new Response(
          JSON.stringify([{ name: "feature", merged: false, state: "success" }]),
          {
            status: 200,
          },
        );
      }

      if (path.includes("/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
            { id: "loc-de", name: "de", code: "de-DE", default: false },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/uploads") && path.includes("branch=feature")) {
        return new Response(
          JSON.stringify([
            {
              id: "upload-feature",
              filename: "home.json",
              format: "json",
              state: "success",
              tags: ["app"],
              url: "https://app.phrase.com/upload/feature",
              updated_at: "2026-05-01T00:00:00Z",
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/uploads")) {
        return new Response(
          JSON.stringify([
            {
              id: "upload-1",
              filename: "home.json",
              format: "json",
              state: "success",
              tags: ["app"],
              url: "https://app.phrase.com/upload/1",
              updated_at: "2026-05-01T00:00:00Z",
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/keys") && path.includes("branch=feature")) {
        return new Response(
          JSON.stringify([
            {
              id: "key-feature",
              name: "feature.title",
              description: "Feature headline",
              tags: ["app"],
              custom_metadata: { screen: "home" },
              data_type: "string",
              updated_at: "2026-05-02T00:00:00Z",
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/keys")) {
        return new Response(
          JSON.stringify([
            {
              id: "key-1",
              name: "home.hero.title",
              description: "Hero headline",
              tags: ["app", "marketing"],
              custom_metadata: { screen: "home" },
              data_type: "icu",
              updated_at: "2026-05-02T00:00:00Z",
            },
            {
              id: "key-2",
              name: "home.hero.subtitle",
              description: "Hero subtitle",
              tags: ["app"],
              custom_metadata: { screen: "home" },
              data_type: "icu",
              updated_at: "2026-05-02T00:00:00Z",
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/translations") && path.includes("locale_name=fr")) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-fr-1",
              key_id: "key-1",
              locale_name: "fr",
              content: "Bonjour",
              state: "translated",
              unverified: false,
              excluded: false,
            },
            {
              id: "tr-fr-2",
              key_id: "key-2",
              locale_name: "fr",
              content: "Sous-titre",
              state: "translated",
              unverified: false,
              excluded: true,
            },
            {
              id: "tr-fr-feature",
              key_id: "key-feature",
              locale_name: "fr",
              content: "Feature",
              state: "translated",
              unverified: false,
              excluded: false,
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/translations") && path.includes("locale_name=de")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (path.includes("/translations") && path.includes("locale_name=en")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await phraseTmsProvider.fetchFileKeys({
      organizationId: "org-1",
      projectId: "project-1",
      externalProjectId: "proj-1",
      credential,
      project,
      secretMaterial: "phrase-secret",
    });

    const defaultKey = result.find(
      (item) => item.resourceType === "key" && item.externalResourceId === "key-1",
    );
    expect(defaultKey).toMatchObject({
      sourcePath: "keys/home.hero.title",
      displayName: "home.hero.title",
      format: "icu",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      localeReadiness: {
        "fr-FR": "ready",
        "de-DE": "missing",
      },
      providerPayload: {
        id: "key-1",
        key: "home.hero.title",
        branch: null,
        tags: ["app", "marketing"],
        customMetadata: { screen: "home" },
      },
    });

    const branchKey = result.find(
      (item) => item.resourceType === "key" && item.externalResourceId === "feature::key-feature",
    );
    expect(branchKey).toMatchObject({
      sourcePath: "feature/keys/feature.title",
      providerPayload: expect.objectContaining({
        branch: "feature",
        tags: ["app"],
      }),
    });

    const branchFile = result.find(
      (item) =>
        item.resourceType === "file" && item.externalResourceId === "feature::upload-feature",
    );
    expect(branchFile).toMatchObject({
      sourcePath: "feature/locales/en-US/home.json",
    });

    const defaultFile = result.find(
      (item) => item.resourceType === "file" && item.externalResourceId === "upload-1",
    );
    expect(defaultFile).toMatchObject({
      sourcePath: "locales/en-US/home.json",
      displayName: "home.json",
      localeReadiness: {
        "fr-FR": "ready",
        "de-DE": "missing",
      },
      providerPayload: expect.objectContaining({
        branch: null,
        tags: ["app"],
        localeDownload: expect.objectContaining({
          localeId: "loc-en",
          localeName: "en",
          fileFormat: "json",
          downloadPath: "/projects/proj-1/locales/loc-en/download",
        }),
      }),
    });
  });

  it("throws phrase_auth_invalid for unauthorized responses", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    }) as unknown as typeof fetch;

    await expect(
      phraseTmsProvider.fetchFileKeys({
        organizationId: "org-1",
        projectId: "project-1",
        externalProjectId: "proj-1",
        credential,
        project,
        secretMaterial: "phrase-secret",
      }),
    ).rejects.toThrow("phrase_auth_invalid");
  });
});
describe("phrase locale readiness", () => {
  it("maps translated content to ready", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "Bonjour",
        state: "translated",
        unverified: false,
        excluded: false,
      }),
    ).toBe("ready");
  });

  it("maps empty content to missing", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "",
        state: "translated",
        unverified: false,
        excluded: false,
      }),
    ).toBe("missing");
  });

  it("maps non-translated content to unverified", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "Draft copy",
        state: "draft",
        unverified: false,
        excluded: false,
      }),
    ).toBe("unverified");
  });

  it("maps unverified translated content to unverified", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "Bonjour",
        state: "translated",
        unverified: true,
        excluded: false,
      }),
    ).toBe("unverified");
  });

  it("scopes key identity by branch when present", () => {
    expect(buildPhraseKeyExternalResourceId("key-1", "feature")).toBe("feature::key-1");
    expect(buildPhraseKeyExternalResourceId("key-1", null)).toBe("key-1");
    expect(parsePhraseExternalResourceId("feature::key-1")).toEqual({
      branch: "feature",
      resourceId: "key-1",
    });
    expect(parsePhraseExternalResourceId("key-1")).toEqual({
      branch: null,
      resourceId: "key-1",
    });
    expect(buildPhraseKeySourcePath("home.hero.title", null)).toBe("keys/home.hero.title");
    expect(buildPhraseKeySourcePath("home.hero.title", "feature")).toBe(
      "feature/keys/home.hero.title",
    );
    expect(buildPhraseUploadSourcePath("en-US", "home.json", null)).toBe("locales/en-US/home.json");
    expect(buildPhraseUploadSourcePath("en-US", "home.json", "feature")).toBe(
      "feature/locales/en-US/home.json",
    );
    expect(buildPhraseUploadSourcePath(null, "home.json", "feature")).toBe(
      "feature/uploads/home.json",
    );
  });
});
